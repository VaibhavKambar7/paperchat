import { useState, useEffect, useRef, RefObject } from "react";
import { GoSidebarExpand } from "react-icons/go";
import { PiSpinnerBold } from "react-icons/pi";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import Sidebar from "./sidebar";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  loading: boolean;
  error: string;
  pdfUrl: string;
  setIsSidebarOpen: (open: boolean) => void;
  isSidebarOpen: boolean;
  navigateToPageNumber?: number;
  onPageNavigationComplete?: () => void;
}

export function PDFViewer({
  loading,
  error,
  pdfUrl,
  isSidebarOpen,
  setIsSidebarOpen,
  navigateToPageNumber,
  onPageNavigationComplete,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState<number>(1.0);
  const [currentPageNumDisplay, setCurrentPageNumDisplay] = useState<number>(1);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setNumPages(null);
    setViewerError(null);
    setCurrentPageNumDisplay(1);
  }, [pdfUrl]);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current || !numPages) return;

      const container = containerRef.current;
      const containerCenter = container.scrollTop + container.clientHeight / 2;

      let closestPage = 1;
      let closestDistance = Infinity;

      pageRefs.current.forEach((pageRef, index) => {
        if (pageRef) {
          const pageCenter = pageRef.offsetTop + pageRef.offsetHeight / 2;
          const distance = Math.abs(pageCenter - containerCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestPage = index + 1;
          }
        }
      });
      setCurrentPageNumDisplay(closestPage);
    };

    const container = containerRef.current;
    container?.addEventListener("scroll", handleScroll);
    return () => container?.removeEventListener("scroll", handleScroll);
  }, [numPages]);

  useEffect(() => {
    if (
      navigateToPageNumber &&
      navigateToPageNumber > 0 &&
      navigateToPageNumber <= (numPages || 0)
    ) {
      goToPage(navigateToPageNumber);
      if (onPageNavigationComplete) {
        onPageNavigationComplete();
      }
    }
  }, [navigateToPageNumber, numPages]);

  function onDocumentLoadSuccess({ numPages: total }: { numPages: number }) {
    setNumPages(total);
    pageRefs.current = new Array(total).fill(null);
    if (
      navigateToPageNumber &&
      navigateToPageNumber > 0 &&
      navigateToPageNumber <= total
    ) {
      goToPage(navigateToPageNumber);
    }
  }

  function onDocumentLoadError(err: Error) {
    const isWorkerError = err.message.includes("worker");
    const msg = isWorkerError
      ? `Failed to load PDF worker. Ensure 'pdf.worker.min.js' is set. Error: ${err.message}`
      : `Failed to load PDF. ${err.message || "Try another file."}`;
    setViewerError(msg);
  }

  function zoomIn() {
    setScale((prev) => Math.min(prev + 0.2, 3.0));
  }

  function zoomOut() {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  }

  function goToPage(pageNum: number) {
    if (pageNum < 1 || pageNum > (numPages || 0)) {
      console.warn(`Attempted to go to invalid page: ${pageNum}`);
      return;
    }
    const pageRef = pageRefs.current[pageNum - 1];
    if (pageRef) {
      pageRef.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const displayError = error || viewerError;

  return (
    <div className="w-1/2 relative flex h-screen">
      {isSidebarOpen && (
        <div className="w-64 fixed h-full bg-white border-r border-gray-200 z-40">
          <Sidebar setIsSidebarOpen={setIsSidebarOpen} />
        </div>
      )}

      <div className="flex-1 h-full bg-white flex flex-col shadow-xl border border-gray-200 overflow-hidden">
        {pdfUrl && !displayError && !loading && numPages && (
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm min-h-[72px]">
            <div className="flex items-center space-x-4">
              {!isSidebarOpen && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 rounded-md transition-colors"
                  aria-label="Open sidebar"
                >
                  <GoSidebarExpand className="text-xl text-gray-600 cursor-pointer" />
                </button>
              )}

              <div className="flex items-center space-x-2 text-gray-700">
                <span className="text-sm font-medium">Page</span>
                <span className="bg-white text-black border border-black px-2 py-1 rounded-md text-sm font-semibold min-w-[40px] text-center">
                  {currentPageNumDisplay}
                </span>
                <span className="text-sm text-gray-500">of {numPages}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 bg-gray-50 rounded-lg p-1">
              <button
                onClick={zoomOut}
                disabled={scale <= 0.5}
                className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors text-gray-600"
                aria-label="Zoom Out"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 12H4"
                  />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-700 w-12 text-center">
                {(scale * 100).toFixed(0)}%
              </span>
              <button
                onClick={zoomIn}
                disabled={scale >= 3.0}
                className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors text-gray-600"
                aria-label="Zoom In"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gray-50 p-6"
          style={{ scrollBehavior: "smooth" }}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <PiSpinnerBold className="animate-spin text-4xl text-black mb-4" />
            </div>
          ) : displayError ? (
            <div className="flex flex-col items-center justify-center h-full text-red-500 p-8 text-center">
              <div className="bg-red-50 rounded-full p-4 mb-4">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Unable to Load PDF</h3>
              <p className="text-gray-600 max-w-md">{displayError}</p>
            </div>
          ) : !pdfUrl ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="bg-gray-100 rounded-full p-4 mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-2">No PDF Selected</h3>
              <p className="text-sm text-gray-400">Choose a PDF file to view</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-8">
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <PiSpinnerBold className="animate-spin text-4xl text-black mb-4" />
                  </div>
                }
                error={
                  <div className="text-red-500 text-center py-16">
                    <p>Error initializing PDF viewer.</p>
                  </div>
                }
              >
                {numPages &&
                  Array.from({ length: numPages }, (_, index) => (
                    <div
                      key={`page_${index + 1}`}
                      ref={(el) => {
                        pageRefs.current[index] = el;
                      }}
                      className="mb-8 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200"
                    >
                      <div className="p-4 flex justify-center">
                        <Page
                          pageNumber={index + 1}
                          scale={scale}
                          renderTextLayer
                          renderAnnotationLayer
                          onRenderError={() =>
                            setViewerError("Error rendering PDF page.")
                          }
                          loading={
                            <div className="flex items-center justify-center py-8">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                            </div>
                          }
                        />
                      </div>
                    </div>
                  ))}
              </Document>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
