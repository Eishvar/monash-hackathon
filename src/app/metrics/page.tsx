"use client";

import { useEffect } from "react";
import type { Metrics } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { AccuracyCard } from "@/components/AccuracyCard";
import { OutcomeDonutCard, ProcessedBarCard } from "@/components/InboxCharts";
import { AccuracySection, DiscrepancySection, HumanSection, PipelineSection } from "@/components/MetricsSections";
import { ShippingRouteMap } from "@/components/ShippingRouteMap";

export default function MetricsPage() {
  const { data: m, reload } = useApi<Metrics>("/metrics");

  // The figures follow the database: emails added or removed elsewhere show up without a manual refresh.
  useEffect(() => {
    const t = setInterval(reload, 20000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>
      <div className="grid gap-3 lg:grid-cols-3">
        <ProcessedBarCard total={m ? m.processed : null} />
        <OutcomeDonutCard metrics={m} />
        <AccuracyCard metrics={m} />
      </div>
      <AccuracySection />
      <DiscrepancySection metrics={m} />
      <PipelineSection />
      <HumanSection />
      <ShippingRouteMap />
    </div>
  );
}
