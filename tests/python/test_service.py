from pathlib import Path
import math
import librosa
import numpy as np
import pytest
from fastapi.testclient import TestClient

from musicdna.service.app import app
from musicdna.features.dsp import AcousticFeatureExtractor
from musicdna.features.projection import EmbeddingProjector
from musicdna.features.embeddings import DeepAudioEncoder, MultimodalFusionEngine, ModelLicenseManager
from musicdna.service.repository import AnalysisRepository
from musicdna.audio.stems import StemSeparator
from musicdna.features.structure import MusicalStructureAnalyzer
from musicdna.preference.favorite_passages import FavoritePassageTaxonomy, AcousticContrastAnalyzer, FavoritePassageEvaluator
from musicdna.preference.active_learning import ActiveLearningEngine
from musicdna.preference.emotion import DynamicEmotionModel
from musicdna.preference.evaluation import ListeningBehaviorAggregator, EvidenceInsightSynthesizer

from musicdna.paths import DEMO_WAV as DEMO_AUDIO_PATH


def test_real_audio_features_are_time_aligned():
    extractor = AcousticFeatureExtractor()
    result = extractor.extract_track_analysis(DEMO_AUDIO_PATH)
    assert result['method'] == 'dsp'
    assert len(result['segments']) >= 4
    assert all(s['startSec'] < s['endSec'] <= result['durationSec'] for s in result['segments'])
    assert all(len(s['embedding']) == 25 for s in result['segments'])
    assert all(len(s['descriptors']['chroma']) == 12 for s in result['segments'])
    assert all(math.isfinite(val) for s in result['segments'] for val in s['embedding'])


def test_projection_uses_actual_vectors_and_handles_identical_inputs():
    projector = EmbeddingProjector()
    projected_points = projector.project_to_2d([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]])
    assert len(projected_points) == 4
    assert all(0.0 <= coordinate <= 1.0 for point in projected_points for coordinate in point)
    assert projector.project_to_2d([[1, 2], [1, 2], [1, 2]]) == [[0.5, 0.5]] * 3
    with pytest.raises(ValueError):
        projector.project_to_2d([[1, 2], [1, 2, 3], [2, 3]])


def test_analysis_requires_confirmation_and_local_file():
    with TestClient(app) as client:
        response = client.post(
            '/api/analyze',
            data={'method': 'dsp'},
            files={'file': ('demo.wav', DEMO_AUDIO_PATH.read_bytes(), 'audio/wav')}
        )
        assert response.status_code == 403

        response = client.post(
            '/api/analyze',
            data={'method': 'dsp', 'local_analysis_confirmed': 'true'},
            files={'file': ('demo.wav', DEMO_AUDIO_PATH.read_bytes(), 'audio/wav')}
        )
        assert response.status_code == 200, response.text
        assert response.json()['segments'][0]['descriptors']['energy'] > 0


def test_projection_endpoint_refuses_malformed_vectors():
    with TestClient(app) as client:
        response = client.post(
            '/api/project',
            json={'modelId': 'librosa-segment-v1', 'vectors': [[1, 2], [2, 1], [3, 4]]}
        )
        assert response.status_code == 200
        assert len(response.json()['points']) == 3

        response = client.post(
            '/api/project',
            json={'modelId': 'librosa-segment-v1', 'vectors': [[1, 2], [2], [3, 4]]}
        )
        assert response.status_code == 422


def test_sqlite_persistence_and_multimodal_fusion():
    import numpy as np

    extractor = AcousticFeatureExtractor()
    dsp = extractor.extract_track_analysis(DEMO_AUDIO_PATH)
    clap_mock = {
        'method': 'clap',
        'modelId': 'mock-clap',
        'durationSec': dsp['durationSec'],
        'segments': [
            {
                'startSec': s['startSec'],
                'endSec': s['endSec'],
                'descriptors': s['descriptors'],
                'embedding': [1.0 / math.sqrt(4)] * 4
            }
            for s in dsp['segments']
        ]
    }
    fused = MultimodalFusionEngine.fuse(dsp, clap_mock, deep_weight=0.7)
    assert fused['method'] == 'multimodal'
    assert len(fused['segments']) == len(dsp['segments'])

    # Verify unit-norm preservation
    for s in fused['segments']:
        norm = np.linalg.norm(s['embedding'])
        assert math.isclose(norm, 1.0, rel_tol=1e-4)

    # Verify SQLite save and retrieval
    repo = AnalysisRepository()
    repo.save_analysis('test-track-1', fused)
    analyses = repo.get_analyses(track_id='test-track-1', method='multimodal')
    assert len(analyses) >= 1
    assert analyses[0]['trackId'] == 'test-track-1'
    stats = repo.get_database_statistics()
    assert stats['analyses'] >= 1
    repo.delete_track_analyses('test-track-1')


def test_passive_listening_research_evaluation():
    aggregator = ListeningBehaviorAggregator()  # default grid: 12 s windows every 6 s

    events = [
        {'kind': 'seek', 'origin': 'user', 'trackId': 't1', 'fromSec': 50, 'toSec': 20, 'sessionId': 's1', 'at': 1},
        {'kind': 'seek', 'origin': 'user', 'trackId': 't1', 'fromSec': 45, 'toSec': 22, 'sessionId': 's2', 'at': 2},
        {'kind': 'listen_span', 'origin': 'player', 'trackId': 't1', 'fromSec': 20, 'toSec': 35, 'durationSec': 15, 'sessionId': 's1', 'at': 3},
        {'kind': 'volume', 'origin': 'user', 'trackId': 't1', 'positionSec': 20, 'sessionId': 's1', 'at': 4},
        {'kind': 'loop_enabled', 'origin': 'user', 'trackId': 't1', 'momentStartSec': 20, 'momentEndSec': 35, 'sessionId': 's1', 'at': 5},
    ]
    moments = [{'trackId': 't1', 'startSec': 20, 'endSec': 35}]

    behaviors = aggregator.extract_passage_behaviors(events)
    window = behaviors['t1:18']  # [18, 30) is covered by both rewinds and contains the volume change
    assert window['manualRewinds'] == 2
    assert window['distinctSessions'] == 2
    assert window['relativeVolumeChanges'] == 1
    assert window['attentionScore'] > 0

    eval_result = aggregator.saved_moment_auc(events, moments)
    assert eval_result['status'] in ('evaluated', 'need_both_classes')


def test_m4_fav_corpus_and_pretrained_encoder_and_licenses():
    license_mgr = ModelLicenseManager()
    encoder = DeepAudioEncoder(license_manager=license_mgr)
    extractor = AcousticFeatureExtractor()
    taxonomy = FavoritePassageTaxonomy()
    contrast_analyzer = AcousticContrastAnalyzer()
    fav_evaluator = FavoritePassageEvaluator(taxonomy=taxonomy, contrast_analyzer=contrast_analyzer)

    # Verify independent license check blocks CC BY-NC 4.0 MuQ weights by default
    with pytest.raises(PermissionError):
        license_mgr.verify_license('muq', allow_noncommercial=False)
    assert license_mgr.verify_license('muq', allow_noncommercial=True)['weights_license'] == 'CC BY-NC 4.0'
    with pytest.raises(PermissionError):
        license_mgr.verify_license('mert', allow_noncommercial=False)
    assert license_mgr.verify_license('mert', allow_noncommercial=True)['weights_license'] == 'CC BY-NC 4.0'

    # Real pretrained deep encoder on authorized demo recording
    dsp = extractor.extract_track_analysis(DEMO_AUDIO_PATH, track_identifier='demo')
    dsp['trackId'] = 'demo'
    deep = encoder.analyze_track_deep(DEMO_AUDIO_PATH)
    deep['trackId'] = 'demo'
    assert deep['method'] == 'clap'
    assert len(deep['segments']) == len(dsp['segments'])
    assert len(deep['segments'][0]['embedding']) == 512
    assert deep['modelId'].startswith('hf-clap:')

    fused = MultimodalFusionEngine.fuse(dsp, deep, deep_weight=0.7)
    assert fused['method'] == 'multimodal'
    assert 'components' in fused
    assert len(fused['segments'][0]['embedding']) == 25 + 512

    # FAV explanation classification and contrast
    reasons = taxonomy.classify('Expressive vocals over a gradually intensifying instrumental arrangement')
    assert 'Vocals' in reasons
    assert 'Build-up' in reasons
    assert 'Instruments' in reasons

    contrast = contrast_analyzer.analyze_contrast(dsp, 0.0, 12.0)
    assert contrast['status'] == 'computed'
    fav_eval = fav_evaluator.evaluate_corpus([dsp], [
        {
            'trackId': 'demo',
            'startSec': 0.0,
            'endSec': 12.0,
            'qualities': ['Vocals', 'Build-up'],
            'note': 'Expressive vocals as the music builds',
        }
    ])
    assert fav_eval['status'] == 'evaluated'
    assert fav_eval['reason_distribution']['Vocals'] == 1


def test_m4_trompa_active_learning_and_personalized_dmer_and_insight():
    extractor = AcousticFeatureExtractor()
    encoder = DeepAudioEncoder()
    active_engine = ActiveLearningEngine()
    insight_synthesizer = EvidenceInsightSynthesizer()

    dsp = extractor.extract_track_analysis(DEMO_AUDIO_PATH, track_identifier='t1')
    dsp['trackId'] = 't1'
    deep = encoder.analyze_track_deep(DEMO_AUDIO_PATH)
    deep['trackId'] = 't1'
    fused = MultimodalFusionEngine.fuse(dsp, deep, deep_weight=0.7)
    fused['trackId'] = 't1'

    # TROMPA-MER active learning query selection
    moments = [
        {'id': 'm1', 'trackId': 't1', 'startSec': 0.0, 'endSec': 12.0, 'qualities': ['Vocals', 'Build-up'], 'note': 'Expressive vocals'},
        {'id': 'm2', 'trackId': 't2', 'startSec': 0.0, 'endSec': 12.0, 'qualities': ['Vocals', 'Build-up'], 'note': 'Intensifying arrangement'},
        {'id': 'm3', 'trackId': 't3', 'startSec': 0.0, 'endSec': 12.0, 'qualities': ['Vocals', 'Build-up'], 'note': 'Rising vocal crescendo'},
    ]
    queries = active_engine.select_informative_queries([fused], moments[:1], [], limit=2)
    assert len(queries) >= 1
    assert 'acquisitionScore' in queries[0]
    prompt = active_engine.formulate_inquiry_prompt(fused['segments'][0], moments)
    assert len(prompt['chips']) == 5

    # Personalized-DMER baseline comparison
    dmer = DynamicEmotionModel.evaluate_baseline([fused])
    assert dmer['status'] == 'evaluated'
    assert dmer['baselines']['personalized_dmer']['ccc'] >= dmer['baselines']['static_ridge']['ccc']
    assert dmer['baselines']['personalized_dmer']['rmse'] <= dmer['baselines']['static_ridge']['rmse']

    # Concrete illustrative insight synthesis
    events = [
        {'kind': 'seek', 'origin': 'user', 'trackId': 't1', 'fromSec': 20.0, 'toSec': 2.0, 'sessionId': 's1', 'at': 1},
        {'kind': 'seek', 'origin': 'user', 'trackId': 't2', 'fromSec': 22.0, 'toSec': 3.0, 'sessionId': 's2', 'at': 2},
    ]
    insight = insight_synthesizer.synthesize([fused], moments, [], events)
    assert insight['headline'] == 'You seem to enjoy vocal passages that become more intense as the music builds.'
    assert 'You confirmed liking three such passages.' in insight['evidence']
    assert 'You repeatedly returned to two of them.' in insight['evidence']


def test_m3_stem_separation_and_musical_dimensions():
    import librosa
    import numpy as np

    separator = StemSeparator()
    analyzer = MusicalStructureAnalyzer()

    waveform, sample_rate = librosa.load(str(DEMO_AUDIO_PATH), sr=22050, duration=15)
    stems = separator.separate(waveform, sample_rate)
    assert set(stems.keys()) == {'vocals', 'drums', 'bass', 'other'}
    for name, arr in stems.items():
        assert len(arr) == len(waveform)
        assert math.isfinite(float(np.mean(arr)))

    # 5 musical dimensions
    dimensions = analyzer.analyze_dimensions(waveform, sample_rate, stems=stems)
    assert 'melodyHarmony' in dimensions
    assert 'rhythmGroove' in dimensions
    assert 'instrumentationTimbre' in dimensions
    assert 'vocalsExpression' in dimensions
    assert 'arrangementTransitions' in dimensions

    # Verify key detection and chord output
    assert dimensions['melodyHarmony']['keyConfidence'] > 0.0
    assert isinstance(dimensions['melodyHarmony']['chords'], list)
    assert dimensions['rhythmGroove']['tempoBpm'] > 60.0
    assert 'syncopation' in dimensions['rhythmGroove']
    assert len(dimensions['instrumentationTimbre']['topInstruments']) >= 1

    # Verify stem streaming endpoints via TestClient
    with TestClient(app) as client:
        # Check stem info endpoint for demo
        resp = client.get('/api/stems/original-demo')
        assert resp.status_code == 200
        data = resp.json()
        assert data['trackId'] == 'original-demo'
        assert set(data['stems']) == {'vocals', 'drums', 'bass', 'other'}

        # Check streaming a stem
        stem_resp = client.get('/api/audio/stem/original-demo/vocals')
        assert stem_resp.status_code == 200
        assert len(stem_resp.content) > 1000


def test_interactive_studio_service_and_endpoints():
    with TestClient(app) as client:
        # Check studio HTML page rendering
        page_resp = client.get('/studio')
        assert page_resp.status_code == 200
        assert 'Music DNA · Research' in page_resp.text
        assert len(page_resp.text) > 10000

        # Check passage contrast evaluation endpoint
        eval_resp = client.post('/api/studio/inspect-passage', json={
            'analysis': {'durationSec': 12.0, 'segments': []},
            'startSec': 0.0,
            'endSec': 6.0,
            'note': 'Expressive vocals as the music builds',
            'qualities': ['Vocals', 'Build-up']
        })
        assert eval_resp.status_code == 200
        payload = eval_resp.json()
        assert 'contrast' in payload
        assert 'detectedFavReasons' in payload
        assert 'Vocals' in payload['detectedFavReasons']
        assert 'Build-up' in payload['detectedFavReasons']


def test_stream_resolution_and_proxy_endpoints():
    with TestClient(app) as client:
        # Direct audio stream resolution
        resp = client.post('/api/stream/resolve', json={'url': 'https://example.com/audio/sample_crescendo.mp3'})
        assert resp.status_code == 200
        data = resp.json()
        assert data['source'] == 'direct'
        assert data['title'] == 'Sample Crescendo'
        assert data['isDirect'] is True
        assert data['streamUrl'] == 'https://example.com/audio/sample_crescendo.mp3'

        # SSE streaming analysis endpoint for demo
        stream_resp = client.get('/api/analyze/stream/original-demo')
        assert stream_resp.status_code == 200
        assert 'text/event-stream' in stream_resp.headers.get('content-type', '')


def test_deep_encoder_separates_clearly_different_sounds():
    # Guards against random or collapsed weights: a trained encoder must tell a tone from noise from music.
    sample_rate = 22050
    time_axis = np.arange(sample_rate * 6) / sample_rate
    music, _ = librosa.load(DEMO_AUDIO_PATH, sr=sample_rate, duration=6)
    clips = [
        0.3 * np.sin(2 * np.pi * 440 * time_axis),
        0.3 * np.random.default_rng(0).standard_normal(len(time_axis)),
        music,
    ]
    vectors = np.stack(DeepAudioEncoder().encode_clips_with_hf_clap(clips, sample_rate))
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
    similarity = vectors @ vectors.T
    assert similarity[np.triu_indices(3, k=1)].max() < 0.9
