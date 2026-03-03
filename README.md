# Sound Bubble 

## Tagline
A calm, interactive web soundscape where users could mix audios through bubble interactions and save mixes as jars.
It combines playful interaction design, subtle physics, and guided breathing support for moments of rest and focus.

## Project Description
Sound Bubble is an interactive sound-mixing interface built with SvelteKit where users can activate ambient sounds as bubbles (rain, ocean, white noise, birds, etc.), drag them through a shared physical space, adjust each bubble’s volume independently, merge or separate bubbles for exploratory sound composition, and save mixes into a cabinet of jars for replay. The interface also includes a guided breathing mode with hand-detection support, using the 4-7-8 breathing technique (inhale for 4 seconds, hold for 7 seconds, exhale for 8 seconds), a widely used relaxation method for reducing stress and helping users return to a calmer state.

Core features:
- Physics-based bubble movement and collision behavior
- Visual state cues (active glow, opacity/scale by volume)
- Persistent saved mixes (localStorage)
- Cabinet UI with jar controls
- Breathing guide mode with camera-assisted hand check

## Target Audience
- People seeking short moments of calm during high-stress routines

Context of use:
- Study sessions
- Work sprints
- Wind-down routines
- Short guided breathing breaks

## Motivation
This project was created to explore how interaction design can make white-noise customization feel both emotionally engaging and easy to use.

Problems addressed:
- Traditional audio mixers can feel technical and boring
- Calm-focused interfaces often lack playful interaction
- Breathing support tools can feel disconnected from media experiences

Research questions explored:
- How can a white-noise interface become more interactive and interesting through playful metaphors like bubbles and jars?
- How can the system detect and interpret deep-breathing behavior in real time to guide users through a 4-7-8 relaxation cycle?


## Human-Centered Design Analysis

### Affordances and Anti-affordances
Affordances:
- Bubbles suggest touch, drag, and combine interactions
- Jar icons suggest storing and replaying mixes
- A central breathing bubble suggests rhythm-following behavior


### Constraints and Restrictions
- Volume remains bounded within a safe range
- Breathing mode centralizes interaction to reduce cognitive overload
- Hand-check state helps users confirm detection before guided pacing

### Signifiers
- Active glow indicates currently playing sounds
- Bubble size/opacity indicates sound intensity
- Status labels (`Hand detected`, `Hand not detected`, `Calibrating`) indicate sensing state
- Button labels (`Check Hand`, `Start 4-7-8`) indicate clear next actions

### Cues Guiding Behavior
Visual:
- Soft gradients, transparency, and glow reinforce a calm atmosphere
- Spatial grouping separates the mix area and cabinet area

Spatial:
- Main bubble field is the primary interaction zone
- Side cabinet is the persistence/history zone

Auditory:
- Immediate sound response to bubble activation and volume changes

Interactive:
- Drag, click, wheel interactions for manipulation
- Timed phase transitions in breathing mode

### System Response and Feedback
- Immediate visual update on activation/deactivation
- Real-time audio playback changes
- Live phase feedback in breathing mode
- State-aware text feedback for detection quality

Feedback loops:
- Users test a change (move/volume/toggle) and instantly hear/see the outcome
- This supports iterative tuning and reflective behavior

## Installation

### Prerequisites
- Node.js >= 18
- npm >= 9
- Modern browser with camera support (for hand check)

### Setup
```sh
git clone <your-repo-url>
cd midterm-app
npm install
```

### Run locally
```sh
npm run dev
```

Open the URL shown in terminal (typically `http://localhost:5173`).

### Production build
```sh
npm run build
npm run preview
```

## Usage
1. Open the app.
2. Toggle ambient bubbles to start sound playback.
3. Drag bubbles and adjust volume.
4. Save your current mix to the cabinet.
5. Open `Check Hand` to verify camera-based hand detection.
6. Start `4-7-8` breathing mode and follow inhale/hold/exhale guidance.



## License
MIT License.
See [LICENSE](./LICENSE).

## Acknowledgments
Technologies and libraries:
- SvelteKit
- JavaScript / HTML / CSS
- Matter.js
- ml5.js 
- HTML audio playback

White noise sources: 
- https://mc2method.org/white-noise/

Related references:
- https://ml5js.org/
- https://kit.svelte.dev/
- https://brm.io/matter-js/

## Roadmap
Planned next steps:
- Add user-adjustable detection sensitivity
- Add keyboard accessibility mappings
- Improve mobile camera and touch ergonomics
- Add export/import for cabinet mixes
- Add mood-based presets (Sleep / Focus / Custom)
- Refine breathing coaching with adaptive phase timing
