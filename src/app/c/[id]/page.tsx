"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { PDFViewer } from "@/components/pdfViewer";
import { ChatInterface } from "@/components/chatInterface";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { MESSAGE_LIMIT } from "@/app/utils/constants";

interface Message {
  role: "user" | "assistant";
  content: string;
  isProcessing?: boolean;
}

const Chat = () => {
  const params = useParams();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [query, setQuery] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(true);
  const [questions, setQuestions] = useState<string[]>([]);
  const [showQuestions, setShowQuestions] = useState<boolean>(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [targetPdfPage, setTargetPdfPage] = useState<number | undefined>(
    undefined,
  );

  const { data } = useSession();
  const isProcessingRef = useRef<boolean>(false);
  const slug = params.id as string;

  useEffect(() => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const fetchChatsAndPdf = async () => {
      setLoading(true);
      setIsProcessing(true);
      setIsResponding(true);
      setMessages([
        {
          role: "assistant",
          content: "",
          isProcessing: true,
        },
      ]);
      setShowQuestions(true);

      try {
        const [documentResponse, pdfResponse] = await Promise.all([
          axios.post("/api/getConversation", { id: slug }),
          axios.post("/api/getPdf", { id: slug }),
        ]);

        const { chatHistory, embeddingsGenerated } =
          documentResponse?.data?.response || {};
        if (chatHistory?.[0]) {
          setMessages(chatHistory);
          setIsProcessing(false);
          setIsResponding(false);
          setShowQuestions(false);
        } else {
          if (!embeddingsGenerated) {
            await handlePdf();
          }
          setIsProcessing(false);
          setIsResponding(false);
        }

        if (!pdfResponse.data.pdf) {
          throw new Error("PDF data not found");
        }
        setPdfUrl(`data:application/pdf;base64,${pdfResponse.data.pdf}`);
      } catch (error) {
        console.error("Error fetching chats or PDF:", error);
        setMessages([
          {
            role: "assistant",
            content: "Error loading chat history or PDF. Please try again.",
          },
        ]);
        setIsProcessing(false);
        setIsResponding(false);
        toast.error("Failed to load chat history or PDF.");
      } finally {
        setLoading(false);
        isProcessingRef.current = false;
      }
    };

    if (slug) {
      fetchChatsAndPdf();
    } else {
      setLoading(false);
      setIsProcessing(false);
      setIsResponding(false);
      setError("Document ID is missing.");
      toast.error("Document ID is missing from the URL.");
    }
  }, [slug]);

  const handlePdf = async () => {
    setError("");
    try {
      await axios.post("/api/processDocument", { id: slug });

      const response = await fetch("/api/getSummaryAndQuestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: slug,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let streamedSummary = "";

      setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        const lastMessage = newMessages[newMessages.length - 1];
        if (
          lastMessage &&
          lastMessage.role === "assistant" &&
          lastMessage.isProcessing
        ) {
          lastMessage.content = "";
        } else {
          newMessages.push({
            role: "assistant",
            content: "",
            isProcessing: true,
          });
        }
        return newMessages;
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        const lines = chunk.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                  msg.isProcessing ? { ...msg, isProcessing: false } : msg,
                ),
              );
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.summaryChunk) {
                streamedSummary += parsed.summaryChunk;
                setMessages((prevMessages) =>
                  prevMessages.map((msg, index) =>
                    index === prevMessages.length - 1 &&
                    msg.role === "assistant"
                      ? { ...msg, content: streamedSummary }
                      : msg,
                  ),
                );
              }
              if (parsed.questions && Array.isArray(parsed.questions)) {
                setQuestions(parsed.questions);
              }
              if (parsed.error) throw new Error(parsed.error);
            } catch (error) {
              console.error(
                "Error parsing stream data:",
                error,
                "Data was:",
                data,
              );
            }
          }
        }
      }
      setShowQuestions(true);
    } catch (err) {
      console.error("Error processing document:", err);
      setError((err as Error).message);
      toast.error("Failed to process document.");
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.isProcessing
            ? {
                ...msg,
                isProcessing: false,
                content: "Error: Unable to load summary.",
              }
            : msg,
        ),
      );
    }
  };

  const handleSend = async (query: string, useWebSearch: boolean) => {
    if (!query.trim() || isResponding || isProcessing) return;
    if (query.length > 4000) {
      toast.warning("Message too long. Please limit to 4000 characters.");
      return;
    }

    const userMessage: Message = { role: "user", content: query };
    const currentHistory = messages.filter(
      (m) => m.content !== "" && !m.isProcessing,
    );
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setIsResponding(true);
    setShowQuestions(false);

    try {
      const usage = await axios.post("/api/rate-limit/get-usage");

      if (!usage.data.isProUser && usage.data.messageCount >= MESSAGE_LIMIT) {
        toast.warning("You have reached the daily limit of 20 messages.");
        setMessages((prev) => prev.filter((msg) => msg !== userMessage));
        setIsResponding(false);
        return;
      }

      const assistantPlaceholder: Message = { role: "assistant", content: "" };
      setMessages((prevMessages) => [...prevMessages, assistantPlaceholder]);

      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          history: currentHistory,
          documentId: slug,
          useWebSearch,
        }),
      });

      if (!response.ok) {
        toast.error("Failed to get response.");
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let streamedContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n\n");
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.chunk) {
                streamedContent += parsed.chunk;
                setMessages((prevMessages) =>
                  prevMessages.map((msg, index) =>
                    index === prevMessages.length - 1 &&
                    msg.role === "assistant"
                      ? { ...msg, content: streamedContent }
                      : msg,
                  ),
                );
              }
              if (parsed.error) throw new Error(parsed.error);
            } catch (e) {
              console.error("Error parsing stream data:", e, data);
            }
          }
        }
      }
      await axios.post("/api/rate-limit/increment-message");
    } catch (err) {
      console.error("Error fetching response:", err);
      setError((err as Error).message || "Failed to get response");
      setMessages((prev) => {
        if (
          prev.length > 0 &&
          prev[prev.length - 1].role === "assistant" &&
          prev[prev.length - 1].content === ""
        ) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      toast.error("Failed to get response.");
    } finally {
      setIsResponding(false);
    }
  };

  const handleNavigateToPage = useCallback((pageNumber: number) => {
    setTargetPdfPage(pageNumber);
  }, []);

  const handlePageNavigationComplete = useCallback(() => {
    setTargetPdfPage(undefined);
  }, []);

  return (
    <div className="flex h-screen bg-white">
      <PDFViewer
        loading={loading}
        error={error}
        pdfUrl={pdfUrl}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        navigateToPageNumber={targetPdfPage}
        onPageNavigationComplete={handlePageNavigationComplete}
      />
      <ChatInterface
        messages={messages}
        query={query}
        isResponding={isResponding}
        isProcessing={isProcessing}
        onQueryChange={setQuery}
        onSend={handleSend}
        questions={questions}
        showQuestions={showQuestions}
        setShowQuestions={setShowQuestions}
        onNavigateToPage={handleNavigateToPage}
        slug={slug}
      />
    </div>
  );
};

export default Chat;
