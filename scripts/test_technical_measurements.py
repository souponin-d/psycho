"""Regression checks for the measurement protocol, independent of the product."""
import importlib.util
import pathlib
import unittest
import urllib.error

spec = importlib.util.spec_from_file_location(
    "measure", pathlib.Path(__file__).with_name("measure-technical-http.py"))
measure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(measure)


class Measurements(unittest.TestCase):
    def test_percentiles_use_nearest_rank(self):
        self.assertEqual(measure.percentile(list(range(1, 101)), 95), 95)
        self.assertEqual(measure.percentile([42], 99), 42)
        self.assertIsNone(measure.percentile([], 95))

    def test_failures_are_counted_and_not_reported_as_fast_successes(self):
        rows = [{"ok": True, "ms": 10}, {"ok": False, "ms": 5000}]
        result = measure.summarize(rows)
        self.assertEqual(result["attempts"], 2)
        self.assertEqual(result["errors"], 1)
        self.assertEqual(result["success_ms"]["p95"], 10)
        self.assertEqual(result["all_ms"]["p95"], 5000)

    def test_empty_series_does_not_claim_success(self):
        self.assertIsNone(measure.summarize([])["error_rate"])

    def test_session_refresh_replaces_the_anonymous_csrf_token(self):
        class Response:
            status = 200
            def read(self):
                return b'{"csrfToken":"authenticated-token"}'
        class Opener:
            requests = []
            def open(self, request, timeout):
                self.requests.append(request)
                return Response()
        client = measure.Client("http://127.0.0.1:1")
        client.opener = Opener()
        client.token = "anonymous-token"
        client.require("/patient/session")
        client.call("/patient/commands", "POST", {})
        headers = {k.lower(): v for k, v in client.opener.requests[-1].header_items()}
        self.assertEqual(headers["x-csrf-token"], "authenticated-token")

    def test_transport_error_does_not_export_secret_exception_text(self):
        class Opener:
            def open(self, request, timeout):
                raise urllib.error.URLError("a private credential must not be exported")
        client = measure.Client("http://127.0.0.1:1")
        client.opener = Opener()
        row, body = client.call("/health")
        self.assertFalse(row["ok"])
        self.assertEqual(row["error"], "URLError")
        self.assertNotIn("credential", str(row))
        self.assertIsNone(body)


if __name__ == "__main__":
    unittest.main()
