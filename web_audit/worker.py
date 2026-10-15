"""Single-process worker consuming the durable SQLite queue."""

import logging
import threading

logger = logging.getLogger(__name__)


class Worker:
    def __init__(self, storage, crawl_fn):
        self.storage = storage
        self.crawl_fn = crawl_fn
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True, name="scan-worker")

    def start(self):
        self.storage.recover()
        self.thread.start()

    def close(self):
        self.stop.set()
        self.thread.join(timeout=5)

    def run_once(self):
        scan = self.storage.claim()
        if not scan:
            return False
        try:
            pages = []

            def on_page(page):
                pages.append(page)
                self.storage.progress(scan["id"], pages)

            result = self.crawl_fn(
                scan["url"],
                max_pages=scan["max_pages"],
                max_depth=scan["max_depth"],
                on_page=on_page,
            )
            completed_pages = result.get("pages", [])
            error = (
                completed_pages[0].get("error")
                if completed_pages
                else "No pages could be scanned."
            )
            self.storage.finish(scan["id"], result=result, error=error)
        except ValueError as error:
            self.storage.finish(
                scan["id"], result={"pages": pages}, error=str(error)[:500]
            )
        except Exception:
            logger.exception("Scan %s failed", scan["id"])
            self.storage.finish(
                scan["id"],
                result={"pages": pages},
                error="Scan failed. Check the URL and try again.",
            )
        return True

    def run(self):
        while not self.stop.is_set():
            try:
                if self.run_once():
                    continue
            except Exception:
                logger.exception("Worker could not process its queue")
            self.stop.wait(0.5)
