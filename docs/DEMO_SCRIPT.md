# 5-minute competition demo

## 0:00–0:35 — Frame the problem

Open **Overview**.

> Campus data exists, but decisions cross systems. Moving a class can change room capacity, building load, transport pressure and energy. CampusTwin creates one operating model so we can test the change before touching the real campus.

Point to the source indicator. If on Databricks, explicitly show that the twin is governed there. If on demo mode, say so.

## 0:35–1:20 — Show the current twin

Use the topology map and the two pressure tables. Explain:

- nodes are real model entities, not decorative artwork;
- edges represent walking-time relationships;
- room utilization is schedule-derived, not claimed as live occupancy;
- route load is demand divided by active vehicle capacity.

Open **Explore** and filter a room or department. Show an over-capacity session.

## 1:20–2:45 — Run a counterfactual

Open **Simulate**.

Choose **Adjust bus service** for the highest-pressure route and increase active buses. Run the scenario.

Call out four things in the result:

1. before → after metrics;
2. decision score and verdict;
3. cascading effects/action log;
4. explicit model assumptions and uncertainty bands.

Then switch to **Close a room** or **Change section intake** to show the same engine can propagate a different class of intervention.

Key sentence:

> Genie tells us what is true in the governed data. The simulation engine separately tests what might become true if we change the system.

## 2:45–3:45 — Ask Genie

Open **Ask Genie** and ask:

> Which rooms are underutilized this week?

Then:

> Which bus route has the highest peak pressure?

If Genie is configured, show the generated SQL when returned. If not, point out that the UI explicitly says **Local constrained analyst** rather than faking a Genie response.

## 3:45–4:30 — Close the loop

Open **Feedback**. Use a predicted value from the scenario and enter an observed value.

Explain that CampusTwin stores the residual so future models can be calibrated to the specific campus. The loop is:

```text
simulate → implement → observe → learn
```

## 4:30–5:00 — Architecture closer

Open the repository/architecture diagram if presenting from an IDE.

Close with:

> The project is not another campus dashboard. The dashboard is only the observation surface. The actual product is the governed current state, a counterfactual engine, an explainable decision layer, and a feedback memory—all designed to sit on Databricks.
