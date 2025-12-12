// blog/[id]/page.jsx
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function BlogPage() {
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const params = useParams();
  const router = useRouter();
  const { id } = params;

  useEffect(() => {
    const fetchBlog = async () => {
      try {
        const response = await fetch(`http://localhost:4000/api/blog/${id}`);
        const data = await response.json();
        setBlog(data.data);
      } catch (error) {
        console.error("Error fetching blog:", error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchBlog();
    }
  }, [id]);

  const handleBack = () => {
    // 1. Retrieve saved values from sessionStorage
    const savedPage = sessionStorage.getItem("blogListPage") || "1";
    const savedSearch = sessionStorage.getItem("blogListSearch") || "";
    const savedSort = sessionStorage.getItem("blogListSort") || "-1"; // Retrieve sort

    // 2. Build the URLSearchParams object
    const params = new URLSearchParams();
    params.set("page", savedPage);
    params.set("sort", savedSort); // Add sort to params

    if (savedSearch) {
      params.set("search", savedSearch);
    }

    // 3. Navigate back to the list using the full query string
    router.push(`/list?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <p className="text-xl text-gray-600">Loading blog...</p>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-xl text-gray-600">Blog not found</p>
          <button
            onClick={handleBack}
            className="mt-4 rounded-lg bg-emerald-800 px-6 py-2 text-white hover:bg-emerald-700"
          >
            Back to Blogs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-lg">
        {/* Back Button */}
        <button
          onClick={handleBack}
          className="mb-6 flex cursor-pointer items-center text-emerald-800 hover:text-emerald-600"
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
          Back to Blogs
        </button>

        {/* Blog Content */}
        <article>
          <h1 className="mb-4 text-4xl font-bold text-gray-900">
            {blog.title}
          </h1>

          {blog.source && (
            <p className="mb-2 text-sm text-gray-500">Source: {blog.source}</p>
          )}

          {blog.author && (
            <p className="mb-2 text-sm text-gray-500">By: {blog.author}</p>
          )}

          {blog.publishedAt && (
            <p className="mb-6 text-sm text-gray-500">
              Published: {new Date(blog.publishedAt).toLocaleDateString()}
            </p>
          )}

          {blog.urlToImage?.trim() && (
            <img
              src={blog.urlToImage}
              alt={blog.title}
              className="mb-6 w-full rounded-lg shadow-md"
            />
          )}

          {blog.excerpt && (
            <p className="mb-6 text-lg text-gray-700 italic">{blog.excerpt}</p>
          )}

          {blog.content && (
            <div className="prose prose-lg max-w-none">
              <div
                className="whitespace-pre-wrap text-gray-800"
                dangerouslySetInnerHTML={{ __html: blog.content }}
              ></div>
            </div>
          )}

          {blog.url && (
            <a
              href={blog.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-lg bg-emerald-800 px-6 py-3 text-white transition-colors hover:bg-emerald-700"
            >
              Read Full Article →
            </a>
          )}
        </article>
      </div>
    </div>
  );
}
