"use client";
import { CirclePlus, Search, X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState, useEffect, useRef } from "react";
import { toast, ToastContainer } from "react-toastify";

const CreateBlog = () => {
  const [urls, setUrls] = useState([{ id: 1, value: "", isValid: true }]);
  const [isLoading, setIsLoading] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const intervalRef = useRef(null);

  const router = useRouter();

  // --- Utility Functions ---
  const isValidUrl = (string) => {
    if (string.trim() === "") return true;
    const trimmed = string.trim();
    const hasSpace = /\s/.test(trimmed);
    const hasDot = trimmed.includes(".");
    const minLength = trimmed.length >= 4;
    return !hasSpace && hasDot && minLength;
  };

  const normalizeUrl = (string) => {
    const trimmed = string.trim();
    if (trimmed === "") return "";
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  // --- Event Handlers ---
  const handleChange = (id, value) => {
    setUrls(
      urls.map((url) =>
        url.id === id
          ? { ...url, value: value, isValid: isValidUrl(value) }
          : url,
      ),
    );
  };

  const handleAddField = () => {
    const newId = Math.max(...urls.map((u) => u.id)) + 1;
    setUrls([...urls, { id: newId, value: "", isValid: true }]);
  };

  const handleRemoveField = (id) => {
    if (urls.length > 1) {
      setUrls(urls.filter((url) => url.id !== id));
    }
  };

  // --- Timer & Loading Logic ---
  const startLoadingTimer = (validUrlCount) => {
    setIsLoading(true);
    // Rough estimate: 5 seconds per URL processing
    const totalSeconds = validUrlCount * 5;
    setEstimatedTime(totalSeconds);

    intervalRef.current = setInterval(() => {
      setEstimatedTime((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  };

  const stopLoadingTimer = () => {
    setIsLoading(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setEstimatedTime(0);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // --- Submit Logic ---
  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. Prepare Data
    const validUrls = urls
      .filter((url) => url.value.trim() !== "" && url.isValid)
      .map((url) => normalizeUrl(url.value));

    if (validUrls.length === 0) {
      toast.warn("Please enter at least one valid URL ⚠️");
      return;
    }

    // 2. Start UI Loading State
    startLoadingTimer(validUrls.length);

    try {
      // 3. Make Request
      const response = await fetch("http://localhost:4000/api/urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: validUrls, sendToN8n: true }),
      });

      const data = await response.json();

      // 4. Handle Response based on the updated backend structure
      if (data.success) {
        // Check n8n status specifically
        if (data.n8nStatus?.success) {
          // SUCCESS: Extract message from n8n response
          const n8nMessage = data.n8nStatus.message;

          toast.success(
            <div>
              <strong>Process Complete! ✅</strong>
              <br />
              {n8nMessage}
              <br />
              <small className="mt-2 block text-xs opacity-80">
                Total blogs found: {data.summary.totalBlogsFound} | Successful
                URLs: {data.summary.successfulUrls}/{data.summary.totalUrls}
              </small>
            </div>,
            { autoClose: 5000 },
          );
        } else if (data.n8nStatus?.success === false) {
          // Blog scraping succeeded but n8n failed
          const n8nErrorMessage =
            data.n8nStatus.message || data.n8nStatus.error;

          toast.error(
            <div>
              <strong>n8n Integration Failed ❌</strong>
              <br />
              {n8nErrorMessage}
              <br />
              <small className="mt-2 block text-xs opacity-80">
                Blogs were scraped successfully ({data.summary.totalBlogsFound}{" "}
                found) but couldn't be sent to n8n for processing.
              </small>
            </div>,
            { autoClose: 5000 },
          );
        } else {
          // n8n was disabled or no blogs found
          toast.info(
            <div>
              <strong>Blogs Scraped ℹ️</strong>
              <br />
              {data.n8nStatus?.message || "Blogs fetched but not sent to n8n"}
              <br />
              <small className="mt-2 block text-xs opacity-80">
                Total blogs found: {data.summary.totalBlogsFound}
              </small>
            </div>,
            { autoClose: 5000 },
          );
        }
      } else {
        // Overall failure (scraping failed or n8n failed)
        const errorMsg =
          data.n8nStatus?.message ||
          data.n8nStatus?.error ||
          data.error ||
          data.message ||
          "An unknown error occurred during processing.";

        // Check if it's a 404 specifically
        if (response.status === 404) {
          toast.error(
            <div>
              <strong>n8n Webhook Not Found ❌</strong>
              <br />
              {errorMsg}
              <br />
              <small className="mt-2 block text-xs opacity-80">
                The n8n webhook URL returned a 404 error. Please verify your n8n
                workflow is active and the webhook URL is correct.
              </small>
            </div>,
            { autoClose: 5000 },
          );
        } else {
          toast.error(
            <div>
              <strong>Processing Failed ❌</strong>
              <br />
              {errorMsg}
              {data.summary && (
                <>
                  <br />
                  <small className="mt-2 block text-xs opacity-80">
                    Successful: {data.summary.successfulUrls}/
                    {data.summary.totalUrls} URLs | Total blogs:{" "}
                    {data.summary.totalBlogsFound}
                  </small>
                </>
              )}
            </div>,
            { autoClose: 5000 },
          );
        }
      }

      // Log full n8n response data for debugging (optional)
      if (data.n8nStatus?.data) {
        console.log("Full n8n response:", data.n8nStatus.data);
      }
    } catch (error) {
      // Handle Network Errors (e.g., server down or timeout)
      console.error("Submission error:", error);
      toast.error(
        <div>
          <strong>Network Error ❌</strong>
          <br />
          Could not reach the server. Please check your connection.
          <br />
          <small className="mt-2 block text-xs opacity-80">
            {error.message}
          </small>
        </div>,
        { autoClose: 8000 },
      );
    } finally {
      // 5. Reset UI
      stopLoadingTimer();
    }
  };

  return (
    <div className="relative h-screen w-full bg-gray-100">
      {/* Toast Container needs to be present in the tree */}
      <ToastContainer position="top-center" theme="light" />

      <button
        onClick={() => router.push("/")}
        className="mb-6 flex cursor-pointer items-center p-6 text-emerald-800 hover:text-emerald-600"
      >
        <svg
          className="mr-2 h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Home
      </button>

      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-10">
        <h3 className="font-serif text-4xl font-bold text-gray-800">
          Enter your URLs
        </h3>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col items-center justify-center"
        >
          <div className="mb-4 flex flex-col gap-3">
            {urls.map((url) => (
              <div key={url.id} className="flex items-center gap-2">
                <input
                  type="text"
                  name={`url-${url.id}`}
                  disabled={isLoading}
                  className={`w-[45vw] rounded border px-2 py-2 transition-all focus:-translate-y-0.5 focus:shadow-lg focus:outline-none ${
                    url.isValid
                      ? "border-gray-300 bg-white focus:border-emerald-600"
                      : "border-red-500 bg-red-50 focus:border-red-600"
                  } ${isLoading ? "cursor-not-allowed bg-gray-200 text-gray-500" : ""}`}
                  value={url.value}
                  onChange={(e) => handleChange(url.id, e.target.value)}
                  placeholder="example.com or https://www.example.com"
                />
                {urls.length > 1 && (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleRemoveField(url.id)}
                    className="flex items-center justify-center rounded bg-red-500 p-2 text-white hover:bg-red-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    <X size={20} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleAddField}
              disabled={isLoading}
              className="flex cursor-pointer items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              <CirclePlus strokeWidth={2.5} /> Add
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="flex min-w-[120px] cursor-pointer items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus:outline-none disabled:cursor-wait disabled:bg-emerald-800"
            >
              {isLoading ? (
                <>
                  <Loader2
                    className="animate-spin"
                    strokeWidth={2.5}
                    size={18}
                  />
                  <span>
                    {estimatedTime > 0
                      ? `${estimatedTime}s...`
                      : "Finishing..."}
                  </span>
                </>
              ) : (
                <>
                  <Search strokeWidth={2.5} /> Search
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateBlog;
