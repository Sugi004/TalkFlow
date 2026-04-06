"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"

export default function Home() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/conversations");
    } else {
      router.push("/login");
    }
  }, [isAuthenticated]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}