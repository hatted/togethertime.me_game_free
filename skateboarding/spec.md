# Game Design Specification: _Shred Street 3D_

## 1. Game Ideation & Feature Definition

**Genre:** 3D Action / Endless Runner

**Target Audience:** Casual gamers, fans of arcade action, and high-score chasers.

**Core Gameplay Loop:**
The player automatically skates forward down a dynamically generated 3D path. They must quickly react to the environment by dodging roadblocks, leaping over holes and fallen trees, and aligning with slopes to gain speed. Collecting coins increases the score and currency, ending only when the player crashes.

**Core Mechanics & USPs:**

- **Obstacle Avoidance (Roadblocks):** Quick lateral movements to switch lanes and dodge construction barriers, cars, or debris.
- **Verticality (Holes/Trees):** Jumping mechanics to clear ground-level hazards like open manholes or fallen trees.
- **Physics/Momentum (Slopes):** Hitting downhill slopes organically increases the player's speed, making the game more thrilling but harder to control.
- **Timing System:** A "Perfect Timing" mechanic. For example, if a player jumps _exactly_ at the lip of a ramp or obstacle, they perform a kickflip, gain a temporary invulnerability frame, and get a score multiplier.
- **Coin Collection & Scoring:** Coins spawn in arcs or lines, guiding the player toward the optimal path. The score is a combination of distance traveled, coins collected, and timing bonuses.

**Web vs. Mobile App Tailoring:**

- **Performance:** For HTML5/WebGL, we must optimize draw calls. We will use object pooling for the endless track segments, coins, and obstacles to prevent memory leaks and keep the game running at a smooth 60 FPS in-browser.
- **Field of View (FOV):** On a wide desktop browser, we will widen the FOV to give a greater sense of speed. On mobile portrait mode, the camera will sit tighter behind the skater to focus on upcoming lane hazards.
- **Control:** It can control from mobile phone and desktop.

## 2. Level & Progression Design

**Structure:** Procedural Endless Generation divided into "Zones" (e.g., Downtown, Suburbs, Park) to provide visual variety without needing to load entirely new levels.

**Learning Curve & Difficulty Scaling:**

- **Stage 1 (0-1000 meters - "The Suburbs"):** Introduces mechanics one by one. First, simple lane-switching to dodge roadblocks. Then, a few tree logs to jump over. The speed is manageable.
- **Stage 2 (1000-3000 meters - "The Park"):** Introduces gaps/holes that require longer jumps. Slopes are introduced. Hitting a slope increases base speed by 15%, demanding faster reaction times.
- **Stage 3 (3000+ meters - "Downtown Gridlock"):** Obstacles are combined (e.g., a roadblock directly after a slope jump). The speed is very high, and the player relies heavily on the "Perfect Timing" mechanic to survive tight gaps.

## 3. Visuals & Controls

**Art Style:** **Vibrant Low-Poly / Cel-Shaded.**
This is perfect for HTML5. Low-poly models (fewer triangles) ensure lightning-fast load times and high performance across all devices, even low-end laptops. Bright, neon-infused street art aesthetics will make the game visually pop.

**Control Schemes:**
We must design intuitive inputs for both platforms:

- **Web Browser (Keyboard):**
- `A` / `D` or `Left/Right Arrows`: Steer left and right (lane switching).
- `Spacebar` or `Up Arrow`: Jump over holes/trees.
- `Down Arrow`: Duck/crouch under high obstacles (optional addition for depth) or fast-fall to hit slopes perfectly.

- **Mobile Web/App (Touch):**
- `Swipe Left/Right`: Change lanes.
- `Swipe Up`: Jump.
- `Swipe Down`: Fast-fall/Crouch.

## 4. Engagement & Polish ("The Juice")

To make the game feel fun and addictive, we need to inject high levels of polish:

- **Speed & Momentum:** When the player speeds up from a slope, we will slightly pull the camera back, increase the FOV, and add subtle "speed lines" (wind particles) at the edges of the screen to make the player _feel_ the velocity.
- **Audio (SFX & Music):**
- A high-energy, upbeat lo-fi hip-hop or skate-punk backing track.
- Satisfying _clinking_ sounds for coin collection (pitch scales up as you collect multiple in a row).
- The raw sound of urethane wheels on concrete, which pitches up as the player speeds down slopes.

- **Juicy Feedback:** When achieving a "Perfect Timing" jump, time slows down for a microsecond (hit-stop), the skater flashes brightly, and a UI pop-up yells "SICK!" or "PERFECT!" granting double points.
