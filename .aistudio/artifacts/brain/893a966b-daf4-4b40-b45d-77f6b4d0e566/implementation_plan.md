# The Dark Mark Overlay & Sanctuary Hardening

An in-universe celestial phenomenon and stability hardening for **The Horcrux Ledger**: rendering Lord Voldemort's spectral Dark Mark in the night sky canvas behind the ledger whenever all seven Horcruxes are locked into 'Warded' status, accompanied by synthesized atmospheric tremors and deep sibilance, alongside a full QA testing suite and bug fixes.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and visual specifications incorporate the user's design choices:

- **Confirmed Decision 1 (Mark Visual Style)**: A billowing, spectral emerald skull in the sky with a living, undulating serpent coiling smoothly out from the gaping jaw and dissolving into mist.
- **Confirmed Decision 2 (Atmospheric Reaction & Audio)**: An ominous low-frequency rumble, serpentine hiss, and pulsing emerald sky flashes synthesized natively via the Web Audio API without external audio assets.
- **Trigger Logic**: Automatically activates when the count of fragments with status `'Warded'` reaches 7 of 7 (also updates the Soul Integrity Gauge to max and integrates with the registry history log).
- **Manual Control**: A Dark Mark banner control in the header/status area allows toggling or re-summoning the mark without having to reset all statuses.

---

## 1. Overview & Core Concept

When all seven Horcruxes are sealed behind the ancient blood wards of the **Kapidhwaj Wardens**, the Dark Lord's soul reaches total, impenetrable sanctuary. To reflect this cataclysmic pinnacle in the Dark Lord's journey, the skies behind the haunted estate ledger tear open to reveal **The Dark Mark** (*Morsmordre*): a radiant emerald skull floating high in the clouds, its lower jaw giving birth to an undulating emerald serpent that breathes smoke and casts an eerie green glow across the entire parchment frame.

In addition to this visual spectacle, a comprehensive verification pass will test all interactive subsystems (drag-and-drop ordering, keyboard shortcuts, history chronicle, Web Audio synthesis, mobile drawers, and filtering) to eliminate edge cases or potential defects.

---

## 2. User Experience & Visual Design

### The Dark Mark Canvas Sky Layer
- **Layering & Composition**: A full-viewport `<canvas id="dark-mark-canvas">` is placed in the background (`z-index: 0` / `-1` relative to the main container), allowing the Victorian ledger frame to cast an antique silhouette against the haunted sky.
- **Procedural Particle & Vector Animation**:
  - **The Skull**: Spectral, glowing cranium drawn with glowing emerald bezier contours, hollow shadow sockets, and nasal cavity with pulsing opacity ($0.65 \to 0.95$).
  - **The Undulating Serpent**: A mathematical multi-segment spline emerging from the mouth cavity, waving dynamically using sinusoidal wave propagation ($\sin(t \cdot \omega + x)$) with glowing scales, venomous fangs, and trailing smoke wisps.
  - **Atmospheric Clouds & Spores**: Ambient drifting green smoke particles that billow outward from the mark, catching periodic lightning flashes.
- **Sky Lightning Pulses**: Occasional soft emerald lightning flashes across the canvas that illuminate the subtle damask background pattern.
- **Synthesized Audio Atmosphere**:
  - Sub-bass rumble ($40\text{Hz} \to 25\text{Hz}$) layered with filtered brown noise simulating distant thunder.
  - Dual high-pass hiss simulating the serpent's sibilant invocation (*"Morsmordre"*).
  - Harmonic overtone swells tuned to dark intervals (diminished fifths).

---

## 3. Comprehensive Bug Fixes & Codebase Audit

During the verification phase, the following audit targets and fixes will be applied:

1. **AudioContext Autoplay Suspension**: Ensure Web Audio context cleanly initializes or resumes upon the user's first interactive gesture (breaking the seal, pressing sound toggle, or clicking status).
2. **Drag-and-Drop Collision Precision**:
   - Verify that drag-and-drop works seamlessly on both desktop mouse drags and mobile touch drags.
   - Prevent drag reordering from conflicting with text selection in inputs or cards.
   - Ensure the `#1` to `#7` priority badges and the sort selector immediately synchronize when dragged.
3. **Filter and Search Conflict Safeguard**:
   - Ensure that reordering while search or filter is active does not corrupt the persistent array index order of hidden Horcruxes.
4. **Registry History Timestamp Consistency**:
   - Ensure timestamps use reliable 24-hour localized formatting and narrative text escapes special characters safely.
5. **Dossier Drawer Accessibility**:
   - Ensure focus trapping and `aria-hidden` attributes remain synchronized when opening/closing via keyboard shortcuts, buttons, or backdrop clicks.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Viewport                       │
├─────────────────────────────────────────────────────────────┤
│  [Background Layer: z-index: 1]                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ <canvas id="dark-mark-canvas">                         │  │
│  │  - Procedural Emerald Skull Mesh                      │  │
│  │  - Undulating Sinusoidal Spline Serpent               │  │
│  │  - Billowing Spectral Ectoplasm Particles             │  │
│  │  - Sky Glow & Atmospheric Flash Pulses                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Main Application Frame: z-index: 10]                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Sanctuary Header & Dark Mark Banner (When 7 Warded)   │  │
│  │  Soul Integrity Gauge (7 Notches)                     │  │
│  │  Filter Controls & Drag-and-Drop 4x2 Grid             │  │
│  │   ├─ 7 Draggable Horcrux Plates (Touch & Mouse Drag)  │  │
│  │   └─ 8th Card: The Kapidhwaj Wardens (Sponsor)        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [Modals & Drawers: z-index: 100+]                          │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │ Dossier Drawer      │  │ Registry History Modal (H)   │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### State & Storage Management
- `horcrux_ledger_items_v2`: Horcrux data with statuses (`Lost`, `Traced`, `Recovered`, `Warded`).
- `horcrux_ledger_order_v2`: Priority array of IDs preserving custom drag sequence.
- `horcrux_ledger_history_v2`: Chronicled narrative log of all state changes.
- `horcrux_ledger_notes_v2`: Voldemort's encrypted field notes.
- `darkMarkActive`: Runtime boolean state toggled when `counts.Warded === 7`.
