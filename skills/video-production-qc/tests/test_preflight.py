import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("preflight", ROOT / "scripts" / "preflight.py")
preflight = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(preflight)


class PreflightTests(unittest.TestCase):
    def test_local_test_report_is_explicit_and_records_missing_capabilities(self):
        with tempfile.TemporaryDirectory() as directory:
            data = preflight.report(Path(directory), Path(directory) / "output", "local_test")
        self.assertEqual(data["runtime_mode"], "local_test")
        self.assertIn("model_quota_declared", data["checks"])
        self.assertIsInstance(data["missing"], list)

    def test_managed_report_requires_identity_context(self):
        with tempfile.TemporaryDirectory() as directory:
            data = preflight.report(Path(directory), Path(directory) / "output", "managed")
        self.assertFalse(data["checks"]["managed_context"])
        self.assertIn("managed_context", data["missing"])

    def test_managed_report_accepts_runtime_identity_names(self):
        with tempfile.TemporaryDirectory() as directory:
            old = {key: preflight.os.environ.get(key) for key in ("ANBAN_TASK_ID", "ANBAN_PROJECT_ID", "ANBAN_DEFAULT_PROJECT", "ANBAN_EXECUTION_ID")}
            try:
                preflight.os.environ["ANBAN_TASK_ID"] = "task-1"
                preflight.os.environ["ANBAN_PROJECT_ID"] = "project-1"
                preflight.os.environ.pop("ANBAN_DEFAULT_PROJECT", None)
                preflight.os.environ["ANBAN_EXECUTION_ID"] = "execution-1"
                data = preflight.report(Path(directory), Path(directory) / "output", "managed")
            finally:
                for key, value in old.items():
                    if value is None:
                        preflight.os.environ.pop(key, None)
                    else:
                        preflight.os.environ[key] = value
        self.assertTrue(data["checks"]["managed_context"])
        self.assertTrue(data["checks"]["execution_identity"]["task_id_present"])

    def test_audio_preflight_distinguishes_distributed_skills_from_runtime_capabilities(self):
        with tempfile.TemporaryDirectory() as directory:
            plugin_root = Path(directory)
            (plugin_root / "skills/search-pixabay").mkdir(parents=True)
            (plugin_root / "skills/sfxmint").mkdir(parents=True)
            (plugin_root / "skills/search-pixabay/SKILL.md").touch()
            (plugin_root / "skills/sfxmint/SKILL.md").touch()
            data = preflight.report(plugin_root, plugin_root / "output", "local_test", plugin_root)
        audio = data["checks"]["audio_discovery"]
        self.assertTrue(audio["pixabay_skill_distributed"])
        self.assertTrue(audio["sfxmint_skill_distributed"])
        self.assertEqual(audio["pixabay_search_capability"], "not_probed")
        self.assertEqual(audio["sfxmint_lookup_capability"], "not_probed")
        self.assertEqual(audio["audio_mixer_capability"], "not_probed")

    def test_audio_capability_does_not_require_upstream_submodules_or_mcp(self):
        with tempfile.TemporaryDirectory() as directory:
            plugin_root = Path(directory)
            for skill in ("search-pixabay", "sfxmint"):
                skill_dir = plugin_root / "skills" / skill
                skill_dir.mkdir(parents=True)
                (skill_dir / "SKILL.md").touch()
            data = preflight.report(plugin_root, plugin_root / "output", "local_test", plugin_root)
        audio = data["checks"]["audio_discovery"]
        self.assertTrue(audio["pixabay_skill_distributed"])
        self.assertTrue(audio["sfxmint_skill_distributed"])
        self.assertEqual(audio["pixabay_download_capability"], "not_probed")
        self.assertEqual(audio["sfxmint_download_capability"], "not_probed")

    def test_audio_capability_fails_when_adapter_entrypoint_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            plugin_root = Path(directory)
            data = preflight.report(plugin_root, plugin_root / "output", "local_test", plugin_root)
        audio = data["checks"]["audio_discovery"]
        self.assertFalse(audio["pixabay_skill_distributed"])
        self.assertFalse(audio["sfxmint_skill_distributed"])
        self.assertIn("audio_discovery.pixabay_skill_distributed", data["missing"])
        self.assertIn("audio_discovery.sfxmint_skill_distributed", data["missing"])
        self.assertEqual(data["status"], "partial")


if __name__ == "__main__":
    unittest.main()
