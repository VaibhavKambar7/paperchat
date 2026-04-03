import React, { forwardRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { IoSparkles } from "react-icons/io5";
import { PiSpinnerBold } from "react-icons/pi";
import axios from "axios";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";

interface PricingProps {
  selectedPlan: "monthly" | "yearly";
  setSelectedPlan: (plan: "monthly" | "yearly") => void;
}

const Pricing = forwardRef<HTMLElement, PricingProps>(
  ({ selectedPlan, setSelectedPlan }, ref) => {
    const [loading, setLoading] = useState(false);

    const { data: session } = useSession();

    useEffect(() => {
      if (session) {
        const storedPlan = localStorage.getItem("selectedPlan");
        const upgradeFlag = localStorage.getItem("upgradeInitiated");

        if (storedPlan && upgradeFlag === "true") {
          setSelectedPlan(storedPlan as "monthly" | "yearly");
          localStorage.removeItem("selectedPlan");
          localStorage.removeItem("upgradeInitiated");
          handleUpgrade();
        }
      }
    }, [session]);

    const handleUpgrade = async () => {
      if (loading) return;

      try {
        setLoading(true);

        if (!session) {
          localStorage.setItem("selectedPlan", selectedPlan);
          localStorage.setItem("upgradeInitiated", "true");
          await signIn("google", {
            callbackUrl: `/?plan=${selectedPlan}#pricing`,
            redirect: true,
          });
          return;
        }

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
      <section ref={ref} className="py-24">
        <div className="container mx-auto px-4">
          <h3 className="mb-12 text-center text-2xl font-bold text-gray-900 md:text-3xl">
            Pricing Plans
          </h3>
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-4 bg-gray-100 p-1">
              <button
                onClick={() => setSelectedPlan("monthly")}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium ${
                  selectedPlan === "monthly"
                    ? "bg-black text-white"
                    : "text-black"
                } ${loading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setSelectedPlan("yearly")}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium ${
                  selectedPlan === "yearly"
                    ? "bg-black text-white"
                    : "text-black"
                } ${loading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                Yearly
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <div className="relative flex flex-col justify-between border p-6 w-full sm:w-1/3 max-w-md cursor-default space-y-6">
              <div className="text-xl font-bold text-gray-900">Free</div>
              <ul className="space-y-3 text-black text-md">
                {[
                  "✔ 2 PDFs/Day",
                  "✔ 20 Questions/Day",
                  "✔ 500 Pages/PDF",
                  "✔ 10 MB/PDF",
                ].map((item, index) => (
                  <li key={index} className="font-semibold">
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full bg-gray-300 text-sm h-12 cursor-not-allowed text-gray-500 rounded-none"
                disabled
              >
                Current Plan
              </Button>
            </div>

            <div
              className={`relative flex flex-col justify-between border p-6 w-full sm:w-1/3 max-w-md space-y-6 cursor-pointer ${
                selectedPlan === "monthly" || selectedPlan === "yearly"
                  ? "border-black"
                  : "border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xl font-bold text-gray-900">
                  {selectedPlan === "monthly" ? (
                    <>
                      ₹499{" "}
                      <span className="text-xs font-normal text-gray-500">
                        /mo
                      </span>
                    </>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-gray-900">
                          ₹2399
                        </span>
                        <span className="text-xs font-normal text-gray-500">
                          /yr
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">(₹199/mo)</div>
                    </div>
                  )}
                </div>
                {selectedPlan === "yearly" && (
                  <div className="text-xs font-semibold bg-black text-white px-2 py-1">
                    Save 60%
                  </div>
                )}
              </div>
              <ul className="space-y-3 text-black text-md">
                {[
                  "✔ Unlimited PDFs",
                  "✔ Unlimited Questions",
                  "✔ 2,000 Pages/PDF",
                  "✔ 32 MB/PDF",
                ].map((item, index) => (
                  <li key={index} className="font-semibold">
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                onClick={handleUpgrade}
                className={`w-full text-sm h-12 text-white rounded-none ${
                  selectedPlan === "monthly" || selectedPlan === "yearly"
                    ? "bg-black hover:bg-gray-800 cursor-pointer"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
                disabled={
                  loading ||
                  (selectedPlan !== "monthly" && selectedPlan !== "yearly")
                }
              >
                {loading ? (
                  <PiSpinnerBold className="animate-spin text-4xl" />
                ) : (
                  <div className="flex items-center gap-2">
                    <IoSparkles />
                    Upgrade to Plus
                  </div>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  },
);

export default Pricing;
