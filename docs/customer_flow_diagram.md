# Swimlane Diagram: Customer Experience & Order Flow (MVP)

This swimlane view shows how the main actors (Customer, Amazon, n8n, Renderer, POD) interact across the lifecycle of an order.

---

```mermaid
graph TD

subgraph Customer
    A[Browse & Customize on Amazon]
    B[Checkout]
    C[Order Confirmation]
    D[Receives Shipment]
end

subgraph Amazon
    E[Amazon Custom Product Page]
    F[SP-API Order Created]
    G[Amazon Sends Confirmation Email]
    H[Amazon Sends Shipping Email]
end

subgraph n8n
    I[Flow A: Poll Orders]
    J[Extract Customization Fields]
    K[Call Renderer → Book PDFs]
    L[Submit POD Order]
    M[Flow B: Poll POD Status]
    N[Confirm Shipment via SP-API]
end

subgraph Renderer
    O[Merge Prefab Backgrounds + Character Overlays]
    P[Generate Book.pdf & Cover.pdf]
    Q[Store Files in S3/R2]
end

subgraph POD Provider
    R[Receive Print Job]
    S[Print & Bind Book]
    T[Ship Book]
    U[Return Tracking #]
end

%% Flow connections
A --> E --> B --> F --> G --> C
F --> I --> J --> K --> O --> P --> Q --> K
K --> L --> R --> S --> T --> U --> M
M --> N --> H --> D
```

---

## Notes
- **Customer Lane:** Discovery, customization, checkout, confirmation, delivery.
- **Amazon Lane:** Captures customization, triggers SP‑API events, sends official comms.
- **n8n Lane:** Orchestrates intake (Flow A), generation, POD submission, and tracking (Flow B).
- **Renderer Lane:** Combines prefab assets and personalization, outputs print‑ready PDFs.
- **POD Lane:** Prints, ships, and returns tracking to feed back into Amazon.

---

✅ This diagram can be used both for UX discussions and as an engineering reference for implementing the MVP system.

