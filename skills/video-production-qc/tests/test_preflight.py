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

    def test_audio_capability_checks_use_the_selected_skill_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            plugin_root = Path(directory)
            (plugin_root / "skills/search-pixabay").mkdir(parents=True)
            (plugin_root / "skills/pixabay-search-skill/src/search-pixabay").mkdir(parents=True)
            (plugin_root / "skills/sfxmint").mkdir(parents=True)
            (plugin_root / "skills/sfxmint-mcp/skills/sfxmint").mkdir(parents=True)
            (plugin_root / "skills/search-pixabay/SKILL.md").touch()
            (plugin_root / "skills/pixabay-search-skill/src/search-pixabay/SKILL.md").touch()
            (plugin_root / "skills/sfxmint/SKILL.md").touch()
            (plugin_root / "skills/sfxmint-mcp/skills/sfxmint/SKILL.md").touch()
            data = preflight.report(plugin_root, plugin_root / "output", "local_test", plugin_root)
        self.assertTrue(data["checks"]["pixabay_bgm_skill_installed"])
        self.assertTrue(data["checks"]["sfxmint_sfx_skill_installed"])

    def test_audio_capability_fails_when_adapter_entrypoint_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            plugin_root = Path(directory)
            (plugin_root / "skills/pixabay-search-skill/src/search-pixabay").mkdir(parents=True)
            (plugin_root / "skills/sfxmint-mcp/skills/sfxmint").mkdir(parents=True)
            (plugin_root / "skills/pixabay-search-skill/src/search-pixabay/SKILL.md").touch()
            (plugin_root / "skills/sfxmint-mcp/skills/sfxmint/SKILL.md").touch()
            data = preflight.report(plugin_root, plugin_root / "output", "local_test", plugin_root)
        self.assertFalse(data["checks"]["pixabay_bgm_skill_installed"])
        self.assertFalse(data["checks"]["sfxmint_sfx_skill_installed"])


if __name__ == "__main__":
    unittest.main()
