"use client";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  return (
    <div className="relative h-screen w-full bg-gray-100">
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-5">
        <button
          onClick={() => router.push("/createBlog")}
          className="focus:ring-opacity-50 cursor-pointer rounded bg-emerald-800 px-6 py-3 font-semibold text-white shadow-lg hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
        >
          Create Blogs
        </button>
        <button
          onClick={() => router.push("/list")}
          className="focus:ring-opacity-50 cursor-pointer rounded bg-emerald-800 px-6 py-3 font-semibold text-white shadow-lg hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
        >
          View your Blogs
        </button>
      </div>
    </div>
  );
}
