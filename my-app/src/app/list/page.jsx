"use client";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  MoveLeft,
  MoveRight,
  Search,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

function Page() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Get current state directly from URL
  const currentPage = parseInt(searchParams.get("page")) || 1;
  const searchQuery = searchParams.get("search") || "";

  const rawSort = searchParams.get("sort");
  const sortOrder = parseInt(rawSort) === 1 ? 1 : -1;

  const fetchBlogs = async (page, search, sort) => {
    try {
      setLoading(true);
      const url = new URL(`http://localhost:4000/api/blogs`);
      url.searchParams.set("page", page);
      if (search) url.searchParams.set("search", search);
      url.searchParams.set("sort", sort);

      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();

      setBlogs(data.data);
      setPagination(data.pagination);

      // Save current parameters to sessionStorage
      sessionStorage.setItem("blogListPage", page.toString());
      sessionStorage.setItem("blogListSort", sort.toString());
      if (search) sessionStorage.setItem("blogListSearch", search);
      else sessionStorage.removeItem("blogListSearch");
    } catch (error) {
      console.error("Error fetching blogs: ", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch blogs whenever URL params change
  useEffect(() => {
    fetchBlogs(currentPage, searchQuery, sortOrder);
  }, [currentPage, searchQuery, sortOrder]);

  // SCROLL RESTORATION
  useEffect(() => {
    const savedScroll = sessionStorage.getItem("blogListScroll");
    if (savedScroll && blogs.length > 0) {
      window.scrollTo(0, parseInt(savedScroll));
      sessionStorage.removeItem("blogListScroll");
    }
  }, [blogs]);

  // Search submit handler
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const searchValue = formData.get("search").trim();

    const params = new URLSearchParams();
    params.set("page", "1");
    if (searchValue) params.set("search", searchValue);
    params.set("sort", sortOrder.toString()); // Use .toString() when setting URL params

    router.push(`/list?${params.toString()}`);
  };

  const handleClearSearch = () => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("sort", sortOrder.toString()); // Use .toString() when setting URL params

    router.push(`/list?${params.toString()}`);
  };

  const handleSortToggle = () => {
    // Toggle sortOrder: -1 (newest) becomes 1 (oldest), and vice versa
    const newSortOrder = sortOrder === -1 ? 1 : -1;

    const params = new URLSearchParams();
    params.set("page", "1"); // Always reset to page 1 when sorting
    params.set("sort", newSortOrder.toString()); // Use .toString() when setting URL params
    if (searchQuery) params.set("search", searchQuery);

    router.push(`/list?${params.toString()}`);
  };

  const handleBlogClick = (blogId) => {
    sessionStorage.setItem("blogListScroll", window.scrollY.toString());
    router.push(`/blog/${blogId}`);
  };

  const handleBackToHome = () => {
    // Clear all persisted state
    sessionStorage.removeItem("blogListPage");
    sessionStorage.removeItem("blogListSearch");
    sessionStorage.removeItem("blogListScroll");
    sessionStorage.removeItem("blogListSort");
    router.push("/");
  };

  const handlePageChange = (newPage) => {
    const params = new URLSearchParams();
    params.set("page", newPage.toString());
    if (searchQuery) params.set("search", searchQuery);
    params.set("sort", sortOrder.toString()); // Ensure sort is passed as string to URL

    router.push(`/list?${params.toString()}`);
  };

  return (
    <div className="relative h-screen w-screen bg-gray-100">
      <div className="flex w-full items-center p-4">
        <button
          onClick={handleBackToHome}
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
          Back to Home
        </button>
        <div className="mx-auto">
          <form className="group relative" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Search blogs..."
              className="rounded-l-4xl rounded-r-none bg-white px-4 py-2 transition-all duration-200 group-focus-within:-translate-y-0.5 group-focus-within:shadow-lg focus:outline-none"
              name="search"
              defaultValue={searchQuery}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute top-1/2 right-26 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-gray-600"
              >
                <X className="text-black" size={18} />
              </button>
            )}
            <button
              type="submit"
              className="cursor-pointer rounded-l-none rounded-r-4xl bg-emerald-800 px-2 py-2 font-bold text-white transition-all duration-200 group-focus-within:-translate-y-0.5 group-focus-within:shadow-lg hover:bg-emerald-700 focus:outline-none"
            >
              <Search className="inline-flex" strokeWidth={2.5} /> Search
            </button>
          </form>
        </div>
      </div>
      <div className="scrollbar-hide absolute top-1/2 left-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 overflow-auto bg-white px-6 py-2 md:h-3/4 md:w-1/2 md:rounded-2xl md:shadow-lg">
        <h5 className="mt-1 text-center text-xl font-bold">Blogs</h5>

        {loading ? (
          <p className="mt-8 text-center text-gray-500">Loading blogs...</p>
        ) : (
          <>
            {/* Blog List */}
            <ul className="mt-6 flex flex-col">
              {blogs?.length === 0 ? (
                <p className="text-center text-gray-500">No blogs found</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-emerald-800">
                      Total Results: {pagination?.totalBlogs}
                    </p>
                    <button
                      onClick={handleSortToggle}
                      className="mt-1 cursor-pointer rounded-lg bg-white px-1 py-1 text-xs font-semibold text-emerald-800 shadow-md transition-all duration-200 hover:bg-emerald-50 hover:shadow-lg active:scale-95 sm:gap-2 sm:px-4 sm:text-sm"
                    >
                      {/* FIX: sortOrder is now guaranteed to be an integer, so this comparison works */}
                      {sortOrder === -1 ? (
                        // Currently newest first (-1)
                        <>
                          <ArrowDownWideNarrow className="inline" size={14} />{" "}
                          Newest
                        </>
                      ) : (
                        // Currently oldest first (1)
                        <>
                          <ArrowUpWideNarrow className="inline" size={14} />{" "}
                          Oldest
                        </>
                      )}
                    </button>
                  </div>
                  {blogs?.map((el, i) => (
                    <li
                      key={el._id || i}
                      onClick={() => handleBlogClick(el._id)}
                      className="m-2 cursor-pointer truncate rounded-lg bg-emerald-800 p-3 font-mono text-base font-semibold text-white shadow-md transition-colors hover:bg-emerald-700"
                    >
                      {el.title}
                    </li>
                  ))}
                </>
              )}
            </ul>

            {/* Pagination controls */}
            {pagination && (
              <div className="fixed right-0 bottom-0 left-0 mx-2 mb-4 flex items-center justify-center gap-2 py-3 backdrop-blur-md sm:mx-4 sm:gap-3 md:mb-6">
                {/* Prev Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!pagination.prevPage}
                  className={`flex items-center gap-1 rounded-lg bg-white px-2 py-2 text-xs font-semibold shadow-md transition-all duration-200 hover:shadow-lg active:scale-95 sm:gap-2 sm:px-4 sm:text-sm ${
                    !pagination.prevPage
                      ? "cursor-not-allowed text-gray-300"
                      : "cursor-pointer text-emerald-800 hover:bg-emerald-50"
                  }`}
                >
                  <MoveLeft
                    strokeWidth={2.5}
                    size={16}
                    className="sm:size-[18px]"
                  />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1 sm:gap-2">
                  {(() => {
                    const pages = [];
                    const totalPages = pagination.totalPages;
                    // Responsive maxVisible: 3 on mobile, 5 on tablet, 7 on desktop
                    const maxVisible =
                      window.innerWidth < 640
                        ? 3
                        : window.innerWidth < 1024
                          ? 5
                          : 7;

                    if (totalPages <= maxVisible) {
                      // Show all pages if total is small
                      for (let i = 1; i <= totalPages; i++) {
                        pages.push(i);
                      }
                    } else {
                      // Smart pagination logic for mobile
                      if (maxVisible === 3) {
                        if (currentPage === 1) {
                          pages.push(1, 2, "...", totalPages);
                        } else if (currentPage === totalPages) {
                          pages.push(1, "...", totalPages - 1, totalPages);
                        } else {
                          pages.push(1, "...", currentPage, "...", totalPages);
                        }
                      } else {
                        // Desktop/tablet logic
                        const showStart =
                          currentPage <= Math.floor(maxVisible / 2) + 1;
                        const showEnd =
                          currentPage >=
                          totalPages - Math.floor(maxVisible / 2);

                        if (showStart) {
                          for (
                            let i = 1;
                            i <= Math.min(maxVisible - 2, totalPages);
                            i++
                          )
                            pages.push(i);
                          if (totalPages > maxVisible - 2) {
                            pages.push("...");
                            pages.push(totalPages);
                          }
                        } else if (showEnd) {
                          pages.push(1);
                          pages.push("...");
                          for (
                            let i = totalPages - (maxVisible - 3);
                            i <= totalPages;
                            i++
                          )
                            pages.push(i);
                        } else {
                          pages.push(1);
                          pages.push("...");
                          for (
                            let i = currentPage - 1;
                            i <= currentPage + 1;
                            i++
                          )
                            pages.push(i);
                          pages.push("...");
                          pages.push(totalPages);
                        }
                      }
                    }

                    return pages.map((page, idx) => {
                      if (page === "...") {
                        return (
                          <span
                            key={`ellipsis-${idx}`}
                            className="px-1 text-xs text-gray-400 sm:px-2 sm:text-sm"
                          >
                            ...
                          </span>
                        );
                      }

                      const isActive = page === currentPage;
                      return (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`min-w-8 cursor-pointer rounded-lg px-2 py-1.5 text-xs font-semibold shadow-md transition-all duration-200 hover:shadow-lg active:scale-95 sm:min-w-10 sm:px-3 sm:py-2 sm:text-sm ${
                            isActive
                              ? "scale-105 bg-emerald-800 text-white shadow-lg"
                              : "bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    });
                  })()}
                </div>

                {/* Next Button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!pagination.nextPage}
                  className={`flex items-center gap-1 rounded-lg bg-white px-2 py-2 text-xs font-semibold shadow-md transition-all duration-200 hover:shadow-lg active:scale-95 sm:gap-2 sm:px-4 sm:text-sm ${
                    !pagination.nextPage
                      ? "cursor-not-allowed text-gray-300"
                      : "cursor-pointer text-emerald-800 hover:bg-emerald-50"
                  }`}
                >
                  <span className="hidden sm:inline">Next</span>
                  <MoveRight
                    strokeWidth={2.5}
                    size={16}
                    className="sm:size-[18px]"
                  />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Page;
