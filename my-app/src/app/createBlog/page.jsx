"use client";
import { CirclePlus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

const CreateBlog = () => {
  const [urls, setUrls] = useState([{ id: 1, value: "", isValid: true }]);

  const router = useRouter();

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validUrls = urls
      .filter((url) => url.value.trim() !== "" && url.isValid)
      .map((url) => normalizeUrl(url.value));

    if (validUrls.length > 0) {
      console.log("Submitted URLs:", validUrls);
      // Your submit logic here
      await fetch("http://localhost:4000/api/urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: validUrls }),
      });
    }
  };

  return (
    <div className="relative h-screen w-full bg-gray-100">
      <button
        onClick={() => router.push("/")}
        className="mb-6 flex items-center p-6 text-emerald-800 hover:text-emerald-600"
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
            {urls.map((url, index) => (
              <div key={url.id} className="flex items-center gap-2">
                <input
                  type="text"
                  name={`url-${url.id}`}
                  className={`w-[45vw] rounded border px-2 py-2 focus:outline-none ${
                    url.isValid
                      ? "border-gray-300 bg-white focus:border-emerald-600"
                      : "border-red-500 bg-red-50 focus:border-red-600"
                  }`}
                  value={url.value}
                  onChange={(e) => handleChange(url.id, e.target.value)}
                  placeholder="example.com or https://www.example.com"
                />
                {urls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveField(url.id)}
                    className="flex items-center justify-center rounded bg-red-500 p-2 text-white hover:bg-red-600 focus:outline-none"
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
              className="flex items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus:outline-none"
            >
              <CirclePlus strokeWidth={2.5} /> Add
            </button>
            <button
              type="submit"
              className="flex items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 focus:outline-none"
            >
              <Search strokeWidth={2.5} /> Search
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateBlog;
