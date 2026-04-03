"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogPortal, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import Image from "next/image";
import { IoSparkles } from "react-icons/io5";
import axios from "axios";
import { toast } from "sonner";
import { PiSpinnerBold } from "react-icons/pi";

interface UpgradeModalProps {
  openUpgradeModal: boolean;
  setOpenUpgradeModal: (open: boolean) => void;
  usage: {
    pdfCount: number;
    messageCount: number;
    isProUser: boolean;
    plan: string | null;
  };
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  openUpgradeModal,
  setOpenUpgradeModal,
  usage,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">(
    "yearly",
  );
  const [loading, setLoading] = useState(false);

  const isSamePlan =
    (usage.plan === "MONTHLY" && selectedPlan === "monthly") ||
    (usage.plan === "YEARLY" && selectedPlan === "yearly");

  const isUpgradeToYearly =
    usage.plan === "MONTHLY" && selectedPlan === "yearly";

  const handleUpgrade = async () => {
    if (loading) return;

    if (isSamePlan) {
      toast.info("You're already subscribed to this plan.");
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post("/api/createCheckoutSession", {
        plan: selectedPlan,
      });

      const { url, error } = response.data;

      if (error) {
        console.error("Checkout error:", error);
        toast.error("Failed to start checkout process. Please try again.");
        return;
      }

      window.location.href = url;
    } catch (err) {
      console.error("Error initiating checkout:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={openUpgradeModal} onOpenChange={setOpenUpgradeModal}>
      <DialogPortal>
        <div className="fixed inset-0 z-50 bg-black/40" />
        <DialogContent className="p-8 sm:p-10 space-y-6 w-3/5 max-w-4xl">
          <DialogTitle />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="flex justify-center">
              <Image
                src="/assets/upgrade-plan.png"
                alt="Upgrade Plan"
                width={4000}
                height={4080}
                className="h-auto w-3/4 object-contain"
              />
            </div>

            <div className="space-y-6 w-full">
              <h2 className="text-2xl font-bold text-black">Upgrade to Plus</h2>

              <ul className="space-y-3 text-black text-md">
                {[
                  "✔ Unlimited PDFs",
                  "✔ Unlimited Questions",
                  "✔ 2,000 Pages/PDF",
                  "✔ 32 MB/PDF",
                ].map((item, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="font-semibold">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-4">
                <div
                  onClick={() => {
                    if (loading) return;
                    if (usage.plan !== "YEARLY") setSelectedPlan("monthly");
                  }}
                  className={`relative flex flex-col justify-between border rounded-none p-3 w-full sm:w-1/2 ${
                    usage.plan === "YEARLY"
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer"
                  } ${
                    selectedPlan === "monthly"
                      ? "border-black"
                      : "border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="monthly"
                      name="plan"
                      checked={selectedPlan === "monthly"}
                      onChange={() => {}}
                      disabled={usage.plan === "YEARLY" || loading}
                      className="accent-black w-4 h-4"
                    />
                    <label
                      htmlFor="monthly"
                      className="font-medium text-gray-900"
                    >
                      Monthly
                    </label>
                  </div>
                  <div className="mt-1 text-xl font-bold text-gray-900">
                    ₹499{" "}
                    <span className="text-xs font-normal text-gray-500">
                      /mo
                    </span>
                  </div>
                </div>

                <div
                  onClick={() => {
                    if (!loading) setSelectedPlan("yearly");
                  }}
                  className={`relative flex flex-col justify-between border rounded-none p-3 w-full sm:w-1/2 cursor-pointer ${
                    selectedPlan === "yearly"
                      ? "border-black"
                      : "border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="yearly"
                      name="plan"
                      checked={selectedPlan === "yearly"}
                      onChange={() => setSelectedPlan("yearly")}
                      disabled={loading}
                      className="accent-black w-4 h-4"
                    />
                    <label
                      htmlFor="yearly"
                      className="font-medium text-gray-900"
                    >
                      Yearly
                    </label>
                    <span className="ml-2 bg-black text-white text-[10px] font-semibold px-1.5 py-0.5">
                      SAVE 60%
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <div className="text-xl font-bold text-gray-900">
                        ₹2399
                      </div>
                      <span className="text-xs font-normal text-gray-500">
                        /yr
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">(₹199/mo)</div>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleUpgrade}
                disabled={isSamePlan || loading}
                className="w-full bg-black rounded-none text-sm h-12 cursor-pointer text-white hover:bg-gray-800 mt-4"
              >
                {loading ? (
                  <PiSpinnerBold className="animate-spin text-4xl" />
                ) : (
                  <div className="flex items-center gap-2">
                    <p>
                      {isSamePlan ? (
                        "Already Subscribed"
                      ) : isUpgradeToYearly ? (
                        "Switch to Yearly"
                      ) : (
                        <div className="flex items-center gap-2">
                          <IoSparkles />
                          Upgrade to Plus
                        </div>
                      )}
                    </p>
                  </div>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default UpgradeModal;
