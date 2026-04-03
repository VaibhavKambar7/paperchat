"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { PiSpinnerBold } from "react-icons/pi";
import { FiChevronDown } from "react-icons/fi";
import Link from "next/link";
import { GoSidebarCollapse } from "react-icons/go";
import { useSession, signIn } from "next-auth/react";
import { IoSparkles } from "react-icons/io5";
import ProfileModal from "./profile-modal";
import UpgradeModal from "./upgrade-modal";
import Image from "next/image";
import { STORAGE_KEY } from "@/app/utils/constants";
import { toast } from "sonner";

interface Chat {
  slug: string;
  fileName: string;
  updatedAt: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface ChatsResponse {
  documents: Chat[];
  pagination: PaginationInfo;
}

export default function Sidebar({
  setIsSidebarOpen,
}: {
  setIsSidebarOpen: (open: boolean) => void;
}) {
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openProfileModal, setOpenProfileModal] = useState(false);
  const [openUpgradeModal, setOpenUpgradeModal] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    limit: 10,
    hasMore: false,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const searchRequestIdRef = useRef(0);
  const { data, status } = useSession();
  const EMAIL = data?.user?.email;
  const params = useParams();
  const id = params?.id ? (params.id as string) : null;

  const [usage, setUsage] = useState({
    pdfCount: 0,
    messageCount: 0,
    isProUser: false,
    plan: null,
  });

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const response = await axios.post("/api/rate-limit/get-usage");
        setUsage(response.data);
      } catch (error) {
        console.error("Failed to fetch usage data:", error);
      }
    };

    if (data?.user?.email) fetchUsage();
  }, [data?.user?.email]);

  const loadCachedChats = useCallback(() => {
    try {
      const cachedData = localStorage.getItem(STORAGE_KEY);
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        if (parsedData.email === EMAIL) {
          setChats(parsedData.chats || []);
          setPagination(
            parsedData.pagination || {
              total: 0,
              page: 1,
              limit: 10,
              hasMore: false,
            },
          );
          return true;
        }
      }
    } catch (error) {
      console.error("Error loading cached chats:", error);
    }
    return false;
  }, []);

  const cacheChats = useCallback(
    (chatsData: Chat[], paginationData: PaginationInfo) => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            email: EMAIL,
            chats: chatsData,
            pagination: paginationData,
          }),
        );
      } catch (error) {
        console.error("Error caching chats:", error);
      }
    },
    [],
  );

  const fetchChats = useCallback(
    async (page: number = 1, existingChats: Chat[] = []) => {
      try {
        if (!EMAIL) {
          setError("Please sign in to continue");
          return;
        }
        setError(null);
        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        const response = await axios.post<ChatsResponse>("/api/getChats", {
          page,
          limit: 10,
        });

        const { documents, pagination: newPagination } = response.data;
        const updatedChats =
          page === 1 ? documents : [...existingChats, ...documents];

        setChats(updatedChats);
        setPagination(newPagination);
        cacheChats(updatedChats, newPagination);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setChats([]);
        } else {
          setError("Failed to load chats. Please try again.");
        }
      } finally {
        if (page === 1) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [cacheChats],
  );

  useEffect(() => {
    const init = async () => {
      const hasCachedData = loadCachedChats();
      if (EMAIL) {
        try {
          await fetchChats(1, hasCachedData ? chats : []);
        } catch (err) {
          if (!hasCachedData) setChats([]);
        }
      }
    };

    init();
  }, [EMAIL]);

  useEffect(() => {
    if (id && chats.length > 0) {
      const chat = chats.find((chat) => chat?.slug === id);
      if (chat?.slug) {
        setActiveChat(chat.slug);
      }
    }
  }, [id, chats]);

  const handleLoadMore = () => {
    if (pagination.hasMore && !loadingMore) {
      fetchChats(pagination.page + 1, chats);
    }
  };

  const handleSignin = async () => {
    await signIn("google");
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      handleSearch();
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleSearch = async () => {
    const requestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    setLoading(true);
    try {
      if (!EMAIL) {
        setError("Please sign in to continue");
        return;
      }
      const res = await axios.post(`/api/searchChats`, {
        keyword: searchQuery.trim() || null,
      });

      if (requestId !== searchRequestIdRef.current) return;

      const { documents } = res.data;
      setChats(documents);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          console.error("Unauthorized access");
        } else {
          console.error("API error:", err.response?.data?.error || err.message);
        }
      } else {
        console.error("Unexpected search error:", err);
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setLoading(false);
        setIsSearching(false);
      }
    }
  };

  return (
    <>
      {openUpgradeModal && (
        <UpgradeModal
          openUpgradeModal={openUpgradeModal}
          setOpenUpgradeModal={setOpenUpgradeModal}
          usage={usage}
        />
      )}
      <div className="h-screen flex">
        <div className="w-72 flex flex-col border-r border-black">
          <div className="sticky top-0 z-10 bg-gray-100">
            <div className="p-4 flex flex-row gap-2 items-center mb-6">
              <GoSidebarCollapse
                className="text-xl cursor-pointer"
                onClick={() => setIsSidebarOpen(false)}
              />
              <a className="text-xl font-bold" href={"/"}>
                Chatcore
              </a>
            </div>

            <div className="px-4 pb-4 bg-gray-100">
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                disabled={isSearching}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchQuery(value);
                }}
                className="w-full bg-white text-gray-900 p-2 border border-gray-300 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-100">
            {status === "authenticated" ? (
              <>
                <nav className="px-4">
                  <ul>
                    {loading ? (
                      <div className="flex items-center justify-center py-4">
                        <PiSpinnerBold className="animate-spin text-xl text-gray-500" />
                      </div>
                    ) : error ? (
                      <div className="text-red-500 text-center py-4">
                        {error}
                      </div>
                    ) : chats.length === 0 ? (
                      <div className="text-gray-500 text-center py-4">
                        No chats found
                      </div>
                    ) : (
                      <>
                        {chats.map((chat, index) => {
                          const isActive = activeChat === chat.slug;
                          return (
                            <li key={`${chat.slug}-${index}`} className="mb-2">
                              <Link
                                href={`/c/${chat.slug}`}
                                onClick={() => setActiveChat(chat.slug)}
                                className={`flex items-center p-3 transition-colors ${
                                  isActive
                                    ? "bg-black text-white font-semibold"
                                    : "text-gray-700 hover:bg-gray-200"
                                }`}
                              >
                                {chat.fileName}
                              </Link>
                            </li>
                          );
                        })}

                        {pagination.hasMore && (
                          <li className="mt-4 text-center">
                            <button
                              onClick={handleLoadMore}
                              disabled={loadingMore}
                              className="flex items-center mb-3 justify-center w-full p-2 text-gray-600 hover:bg-gray-200 hover:cursor-pointer transition-colors"
                            >
                              {loadingMore ? (
                                <PiSpinnerBold className="animate-spin text-xl" />
                              ) : (
                                <>
                                  <FiChevronDown className="mr-1" /> Load More
                                </>
                              )}
                            </button>
                          </li>
                        )}
                      </>
                    )}
                  </ul>
                </nav>
              </>
            ) : (
              <div className="flex flex-col justify-center items-center bg-gray-100">
                <div className="flex items-center justify-center">
                  <Image
                    src="/assets/signin.png"
                    alt="Sign In"
                    width={4000}
                    height={4080}
                    className="h-auto w-3/4 object-contain"
                  />
                </div>
                <p className="text-gray-500 mb-6">
                  Sign in to save your chat history
                </p>
                <button
                  onClick={handleSignin}
                  className="border-0 bg-black cursor-pointer text-white w-30 h-10"
                >
                  Sign In
                </button>
              </div>
            )}
          </div>
          {status === "authenticated" && (
            <>
              <div
                onClick={() => setOpenProfileModal(true)}
                className="flex items-center cursor-pointer justify-center gap-3 px-6 py-3 border-t border-black bg-white text-black"
              >
                <img
                  src={data.user?.image ?? "/default-avatar.png"}
                  alt={data.user?.name ?? "User Avatar"}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <div className="text-md font-medium">
                  {data.user?.name ?? "Anonymous"}
                </div>
              </div>
              <div
                onClick={() => setOpenUpgradeModal(true)}
                className="flex items-center justify-center cursor-pointer h-15 gap-3 px-4 py-3 border-t border-black bg-black text-white"
              >
                <IoSparkles />
                Upgrade to Plus
              </div>
            </>
          )}
          {openProfileModal && (
            <ProfileModal
              openProfileModal={openProfileModal}
              setOpenProfileModal={setOpenProfileModal}
              openUpgradeModal={openUpgradeModal}
              setOpenUpgradeModal={setOpenUpgradeModal}
              usage={usage}
            />
          )}
        </div>
      </div>
    </>
  );
}
