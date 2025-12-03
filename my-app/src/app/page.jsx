"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  const fetchBlogs = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/blogs");
      const data = await response.json();
      const sortedBlogs = (data.data || []).sort((a, b) => {
        const dateA = a.publishedAt || a.created_at || a.createdAt || "";
        const dateB = b.publishedAt || b.created_at || b.createdAt || "";

        return dateB.localeCompare(dateA); // Works for ISO date strings
      });

      setBlogs(sortedBlogs);
      // console.log(data);
    } catch (error) {
      console.error("Error fetching blogs: ", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlogs();
  }, []);

  return (
    <div className="relative h-screen w-screen bg-gray-100">
      <div className="scrollbar-hide absolute top-1/2 left-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 overflow-auto bg-white p-6 md:h-3/4 md:w-1/2 md:rounded-2xl md:shadow-lg">
        <h5 className="mt-3 text-center text-xl font-bold">Blogs</h5>

        {loading ? (
          <p className="mt-8 text-center text-gray-500">Loading blogs...</p>
        ) : (
          <ul className="mt-6 flex flex-col">
            {blogs.length === 0 ? (
              <p className="text-center text-gray-500">No blogs found</p>
            ) : (
              blogs.map((el, i) => (
                <li
                  key={i}
                  onClick={() => router.push(`/blog/${el._id}`)}
                  className="m-2 cursor-pointer truncate rounded-lg bg-emerald-800 p-4 font-mono text-base font-semibold text-white shadow-md transition-colors hover:bg-emerald-700"
                >
                  {el.title}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
