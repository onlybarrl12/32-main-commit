"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type HeadDatum = { head: string; actual: number; approvedBE: number; proposedRBE: number };

// IndianOil brand colors (navy/orange, sampled from the real logo) plus
// amber for "in-progress" figures — same mapping as BudgetOverviewChart and
// the Home page KPI tiles. Reworked 2026-08-12 away from the dataviz-skill's
// generic blue/orange/aqua default — see CLAUDE.md §3.
const COLOR_ACTUAL = "#312D73"; // brand navy
const COLOR_APPROVED_BE = "#EC6519"; // brand orange
const COLOR_PROPOSED_RBE = "#D97706"; // amber — your own in-progress figure

const formatLakh = (v: number) => `₹${(v / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L`;

export function BudgetHeadComparisonChart({ data }: { data: HeadDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="#e7e5e4" vertical={false} />
        <XAxis
          dataKey="head"
          tick={{ fill: "#78716c", fontSize: 10 }}
          axisLine={{ stroke: "#e7e5e4" }}
          tickLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis tickFormatter={formatLakh} tick={{ fill: "#78716c", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value) => formatLakh(Number(value))} contentStyle={{ borderRadius: 8, borderColor: "#e7e5e4", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="actual" name="Actual" fill={COLOR_ACTUAL} radius={[3, 3, 0, 0]} maxBarSize={16} />
        <Bar dataKey="approvedBE" name="Approved BE" fill={COLOR_APPROVED_BE} radius={[3, 3, 0, 0]} maxBarSize={16} />
        <Bar dataKey="proposedRBE" name="Proposed RBE" fill={COLOR_PROPOSED_RBE} radius={[3, 3, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
