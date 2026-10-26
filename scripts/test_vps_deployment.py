"""Exercise systemd semantics without changing local services or the VPS."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("installer", Path(__file__).resolve().parents[1] / "deployment/demo/install-hackathon.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class CaddyLifecycle(unittest.TestCase):
    def check_activation(self, initially_active):
        state = {"active": initially_active, "loaded": "old" if initially_active else None}

        def systemd(args):
            if args == ["systemctl", "enable", "--now", "caddy"]:
                if not state["active"]:
                    state["active"], state["loaded"] = True, "new"
            if args == ["systemctl", "reload", "caddy"]:
                self.assertTrue(state["active"])
                state["loaded"] = "new"

        installer.activate_services(systemd)
        self.assertEqual(state["loaded"], "new", "the already running Caddy must apply the validated configuration")

    def test_running_caddy_applies_configuration(self):
        self.check_activation(True)

    def test_stopped_caddy_starts_with_configuration(self):
        self.check_activation(False)


if __name__ == "__main__":
    unittest.main()
