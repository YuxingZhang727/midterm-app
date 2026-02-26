<script>
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	const bubbleDefs = [
		{ id: 'rain', label: 'Rain', icon: 'R' },
		{ id: 'wind', label: 'Wind', icon: 'W' },
		{ id: 'static', label: 'Static', icon: 'S' },
		{ id: 'birds', label: 'Birds', icon: 'B' },
		{ id: 'ocean', label: 'Ocean', icon: 'O' },
		{ id: 'night', label: 'Night', icon: 'N' }
	];

	const scenes = {
		sleep: {
			title: 'Sleep',
			subtitle: 'Settle into gentle, slower textures.',
			colors: {
				bgA: '#6b7f97',
				bgB: '#93a9bf',
				panel: 'rgba(107, 127, 151, 0.68)',
				bubble: '#c8d9e8',
				text: '#f7fbff',
				soft: '#e1edf7'
			},
			presets: [
				{ name: 'Moon Drift', mix: { rain: 0.65, ocean: 0.3, night: 0.45 } },
				{ name: 'Deep Nest', mix: { wind: 0.35, static: 0.2, night: 0.55 } },
				{ name: 'Cloud Blanket', mix: { rain: 0.45, wind: 0.2, ocean: 0.25 } }
			]
		},
		focus: {
			title: 'Focus',
			subtitle: 'Clear distractions with stable, low-variation layers.',
			colors: {
				bgA: '#6f8f82',
				bgB: '#9ec0b2',
				panel: 'rgba(111, 143, 130, 0.68)',
				bubble: '#cfe6dc',
				text: '#f6fffb',
				soft: '#e2f2ec'
			},
			presets: [
				{ name: 'Green Signal', mix: { static: 0.4, wind: 0.25, rain: 0.2 } },
				{ name: 'Quiet Grid', mix: { ocean: 0.35, static: 0.35 } },
				{ name: 'Single Channel', mix: { wind: 0.45, birds: 0.15, static: 0.2 } }
			]
		},
		customization: {
			title: 'Customization',
			subtitle: 'Build your own calm blend from scratch.',
			colors: {
				bgA: '#9f7f73',
				bgB: '#d0b1a5',
				panel: 'rgba(159, 127, 115, 0.68)',
				bubble: '#f0d9cf',
				text: '#fff8f4',
				soft: '#f5e3db'
			},
			presets: []
		}
	};

	let activeScene = null;
	let drawerOpen = true;
	let mixes = [];
	let mixLabel = '';

	let audioCtx;
	const engines = new Map();
	let bubbles = bubbleDefs.map((b) => ({ ...b, active: false, volume: 0.45 }));

	let dragState = null;

	function destroyAllEngines() {
		for (const [, engine] of engines) {
			try {
				engine.dispose();
			} catch {
				// best effort
			}
		}
		engines.clear();
	}

	async function hardStopAudio() {
		destroyAllEngines();
		if (audioCtx && audioCtx.state !== 'closed') {
			try {
				await audioCtx.close();
			} catch {
				// best effort
			}
		}
		audioCtx = undefined;
	}

	onMount(() => {
		const stored = localStorage.getItem('calm-mixes');
		if (stored) {
			try {
				mixes = JSON.parse(stored);
			} catch {
				mixes = [];
			}
		}
	});

	onDestroy(() => {
		void hardStopAudio();
	});

	$: if (browser && mixes) {
		localStorage.setItem('calm-mixes', JSON.stringify(mixes));
	}

	$: palette = activeScene ? scenes[activeScene].colors : null;
	$: activeCount = bubbles.filter((b) => b.active).length;

	function ensureContext() {
		if (!audioCtx) {
			audioCtx = new AudioContext();
		}
		if (audioCtx.state === 'suspended') {
			audioCtx.resume();
		}
	}

	function createNoiseEngine(type) {
		const gain = new GainNode(audioCtx, { gain: 0 });
		let source;
		let modOsc;
		let modGain;
		let swellGain;
		let interval;

		if (type === 'birds') {
			gain.connect(audioCtx.destination);
			interval = setInterval(() => {
				if (gain.gain.value <= 0.001) return;
				const osc = new OscillatorNode(audioCtx, {
					type: 'triangle',
					frequency: 1150 + Math.random() * 500
				});
				const chirpGain = new GainNode(audioCtx, { gain: 0 });
				osc.connect(chirpGain).connect(gain);
				const now = audioCtx.currentTime;
				chirpGain.gain.setValueAtTime(0, now);
				chirpGain.gain.linearRampToValueAtTime(0.16, now + 0.03);
				chirpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
				osc.frequency.exponentialRampToValueAtTime(1400 + Math.random() * 300, now + 0.16);
				osc.start(now);
				osc.stop(now + 0.2);
			}, 900);
			return {
				setVolume(v) {
					gain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.08);
				},
				dispose() {
					clearInterval(interval);
					gain.disconnect();
				}
			};
		}

		const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < data.length; i += 1) {
			data[i] = Math.random() * 2 - 1;
		}

		source = new AudioBufferSourceNode(audioCtx, { buffer, loop: true });
		const filter = new BiquadFilterNode(audioCtx, { type: 'lowpass', frequency: 1200, Q: 0.7 });

		if (type === 'wind') {
			filter.type = 'bandpass';
			filter.frequency.value = 420;
		}
		if (type === 'static') {
			filter.type = 'highpass';
			filter.frequency.value = 2500;
		}
		if (type === 'ocean') {
			filter.frequency.value = 700;
			swellGain = new GainNode(audioCtx, { gain: 0.62 });
			modOsc = new OscillatorNode(audioCtx, { frequency: 0.07, type: 'sine' });
			modGain = new GainNode(audioCtx, { gain: 0.16 });
			modOsc.connect(modGain).connect(swellGain.gain);
			modOsc.start();
		}
		if (type === 'night') {
			filter.type = 'bandpass';
			filter.frequency.value = 1500;
			filter.Q.value = 3.5;
		}

		if (type === 'ocean') {
			source.connect(filter).connect(swellGain).connect(gain).connect(audioCtx.destination);
		} else {
			source.connect(filter).connect(gain).connect(audioCtx.destination);
		}
		source.start();

		return {
			setVolume(v) {
				gain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.08);
			},
			dispose() {
				if (modOsc) {
					modOsc.stop();
					modOsc.disconnect();
				}
				if (modGain) modGain.disconnect();
				if (swellGain) swellGain.disconnect();
				source.stop();
				source.disconnect();
				filter.disconnect();
				gain.disconnect();
			}
		};
	}

	function updateEngineVolume(id, active, volume) {
		if (!audioCtx) return;
		if (!active) {
			engines.get(id)?.dispose();
			engines.delete(id);
			return;
		}
		if (!engines.has(id)) {
			engines.set(id, createNoiseEngine(id));
		}
		engines.get(id)?.setVolume(volume * 0.35);
	}

	function toggleBubble(id) {
		ensureContext();
		bubbles = bubbles.map((bubble) => {
			if (bubble.id !== id) return bubble;
			const next = { ...bubble, active: !bubble.active };
			updateEngineVolume(next.id, next.active, next.volume);
			return next;
		});
	}

	function setVolume(id, rawValue) {
		const value = Math.max(0, Math.min(1, Number(rawValue)));
		bubbles = bubbles.map((bubble) => {
			if (bubble.id !== id) return bubble;
			const next = { ...bubble, volume: value };
			if (next.active) {
				ensureContext();
				updateEngineVolume(next.id, true, next.volume);
			}
			return next;
		});
	}

	function applyPreset(mix) {
		ensureContext();
		bubbles = bubbles.map((bubble) => {
			const value = mix[bubble.id] ?? 0;
			const next = { ...bubble, volume: value || bubble.volume, active: value > 0 };
			updateEngineVolume(next.id, next.active, next.volume);
			return next;
		});
	}

	function startBubbleDrag(e, id, volume) {
		dragState = { id, startY: e.clientY, startVolume: volume };
		window.addEventListener('pointermove', onBubbleDrag);
		window.addEventListener('pointerup', stopBubbleDrag);
	}

	function onBubbleDrag(e) {
		if (!dragState) return;
		const delta = dragState.startY - e.clientY;
		setVolume(dragState.id, dragState.startVolume + delta / 260);
	}

	function stopBubbleDrag() {
		dragState = null;
		window.removeEventListener('pointermove', onBubbleDrag);
		window.removeEventListener('pointerup', stopBubbleDrag);
	}

	function saveMix() {
		const snapshot = Object.fromEntries(
			bubbles.filter((b) => b.active).map((b) => [b.id, Number(b.volume.toFixed(2))])
		);
		if (!Object.keys(snapshot).length) return;
		const label = mixLabel.trim() || `Jar ${mixes.length + 1}`;
		mixes = [{ label, scene: activeScene, mix: snapshot, id: Date.now() }, ...mixes];
		mixLabel = '';
	}

	function loadMix(jar) {
		activeScene = jar.scene;
		applyPreset(jar.mix);
	}

	function clearAll() {
		bubbles = bubbles.map((bubble) => {
			updateEngineVolume(bubble.id, false, bubble.volume);
			return { ...bubble, active: false };
		});
		void hardStopAudio();
	}
</script>

{#if !activeScene}
	<main class="entry-screen">
		<section>
			<h1>Calm Cabinet</h1>
			<p>Choose your current state to enter a focused sound environment.</p>
		</section>
		<div class="scene-grid">
			{#each Object.entries(scenes) as [sceneKey, scene]}
				<button class="scene-card" style={`--bgA:${scene.colors.bgA};--bgB:${scene.colors.bgB};--text:${scene.colors.text}`} on:click={() => (activeScene = sceneKey)}>
					<h2>{scene.title}</h2>
					<p>{scene.subtitle}</p>
				</button>
			{/each}
		</div>
	</main>
{:else}
	<main class="workspace" style={`--bgA:${palette.bgA};--bgB:${palette.bgB};--panel:${palette.panel};--bubble:${palette.bubble};--text:${palette.text};--soft:${palette.soft};`}>
		<section class="top-row">
			<div>
				<h1>{scenes[activeScene].title} Scene</h1>
				<p>{scenes[activeScene].subtitle}</p>
			</div>
			<nav class="scene-nav" aria-label="Scene switcher">
				{#each Object.keys(scenes) as sceneKey}
					<button class:active={sceneKey === activeScene} on:click={() => (activeScene = sceneKey)}>{scenes[sceneKey].title}</button>
				{/each}
			</nav>
		</section>

		{#if scenes[activeScene].presets.length}
			<section class="preset-panel">
				<h2>Quick presets</h2>
				<div class="preset-row">
					{#each scenes[activeScene].presets as preset}
						<button on:click={() => applyPreset(preset.mix)}>{preset.name}</button>
					{/each}
				</div>
			</section>
		{/if}

		<section class="bubble-grid">
			{#each bubbles as bubble}
				{@const scale = 0.8 + bubble.volume * 0.65}
				{@const opacity = 0.4 + bubble.volume * 0.6}
				<article class="bubble-shell" style={`--scale:${scale};--opacity:${opacity};`}>
					<button
						class="bubble"
						class:active={bubble.active}
						on:pointerdown={(e) => startBubbleDrag(e, bubble.id, bubble.volume)}
						on:click={() => toggleBubble(bubble.id)}
						aria-pressed={bubble.active}
					>
						<span>{bubble.icon}</span>
					</button>
					<h3>{bubble.label}</h3>
					<input type="range" min="0" max="1" step="0.01" value={bubble.volume} on:input={(e) => setVolume(bubble.id, e.currentTarget.value)} aria-label={`${bubble.label} volume`} />
				</article>
			{/each}
		</section>

		<section class="controls">
			<div class="save-box">
				<input type="text" bind:value={mixLabel} placeholder="Label this mix" maxlength="24" aria-label="Mix label" />
				<button on:click={saveMix}>Save to Cabinet</button>
			</div>
			<button class="clear" on:click={clearAll}>Stop all ({activeCount})</button>
		</section>

		<aside class="drawer" class:closed={!drawerOpen}>
			<button class="drawer-toggle" on:click={() => (drawerOpen = !drawerOpen)} aria-label="Toggle cabinet drawer">{drawerOpen ? '>' : '<'}</button>
			<div class="drawer-inner">
				<h2>Glass Jar Cabinet</h2>
				{#if mixes.length === 0}
					<p class="empty">No jars yet. Save your current mix.</p>
				{:else}
					<div class="jar-grid">
						{#each mixes as jar}
							<button class="jar" on:click={() => loadMix(jar)}>
								<div class="lid"></div>
								<div class="liquid" style={`--fill:${Math.max(15, Object.keys(jar.mix).length * 18)}%`}></div>
								<p>{jar.label}</p>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</aside>
	</main>
{/if}

<style>
	:global(body) {
		margin: 0;
		font-family: 'Avenir Next', 'Trebuchet MS', sans-serif;
		background: #050709;
		color: #fff;
	}

	main {
		min-height: 100vh;
	}

	.entry-screen {
		display: grid;
		gap: 2rem;
		padding: 5rem min(6vw, 4rem);
		background: radial-gradient(circle at 20% 20%, #bcd0cb 0%, #9cb7c9 58%, #8ca0b4 100%);
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	.entry-screen h1 {
		font-size: clamp(2rem, 4vw, 3.6rem);
	}

	.entry-screen p {
		max-width: 46ch;
		color: #f2f8fa;
		line-height: 1.55;
	}

	.scene-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
	}

	.scene-card {
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 1.25rem;
		padding: 1.2rem;
		text-align: left;
		cursor: pointer;
		background: linear-gradient(145deg, var(--bgA), var(--bgB));
		color: var(--text);
		min-height: 170px;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.scene-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 14px 30px rgba(0, 0, 0, 0.3);
	}

	.scene-card h2 {
		font-size: 1.3rem;
		margin-bottom: 0.45rem;
	}

	.workspace {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 1.1rem;
		padding: 1.2rem 1.2rem 1.2rem 1.6rem;
		background: radial-gradient(circle at 10% 10%, var(--bgB) 0%, var(--bgA) 62%, #040507 100%);
		color: var(--text);
	}

	.top-row,
	.preset-panel,
	.bubble-grid,
	.controls {
		grid-column: 1 / 2;
		background: var(--panel);
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 1rem;
		padding: 1rem;
		backdrop-filter: blur(16px);
	}

	.top-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
	}

	.top-row p {
		margin-top: 0.3rem;
		color: var(--soft);
	}

	.scene-nav {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.scene-nav button,
	.preset-row button,
	.save-box button,
	.clear,
	.drawer-toggle {
		border: 1px solid rgba(255, 255, 255, 0.22);
		border-radius: 0.85rem;
		background: rgba(255, 255, 255, 0.1);
		color: var(--text);
		padding: 0.5rem 0.8rem;
		cursor: pointer;
	}

	.scene-nav button.active {
		background: rgba(255, 255, 255, 0.27);
	}

	.preset-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.65rem;
	}

	.bubble-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
	}

	.bubble-shell {
		display: grid;
		justify-items: center;
		gap: 0.5rem;
	}

	.bubble {
		width: 84px;
		height: 84px;
		border: none;
		border-radius: 50%;
		background: color-mix(in srgb, var(--bubble) 86%, #ffffff 14%);
		color: #122;
		font-weight: 700;
		font-size: 1.1rem;
		opacity: var(--opacity);
		transform: scale(var(--scale));
		cursor: grab;
		position: relative;
		transition: transform 0.15s linear, opacity 0.15s linear, box-shadow 0.18s ease;
	}

	.bubble:active {
		cursor: ns-resize;
	}

	.bubble.active {
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.6),
			0 0 16px color-mix(in srgb, var(--bubble) 65%, #fff 35%),
			0 0 36px color-mix(in srgb, var(--bubble) 55%, #fff 45%);
		animation: aura 2.2s ease-in-out infinite;
	}

	@keyframes aura {
		0%,
		100% {
			box-shadow:
				0 0 0 1px rgba(255, 255, 255, 0.6),
				0 0 16px color-mix(in srgb, var(--bubble) 55%, #fff 45%),
				0 0 32px color-mix(in srgb, var(--bubble) 45%, #fff 55%);
		}
		50% {
			box-shadow:
				0 0 0 1px rgba(255, 255, 255, 0.7),
				0 0 26px color-mix(in srgb, var(--bubble) 75%, #fff 25%),
				0 0 52px color-mix(in srgb, var(--bubble) 60%, #fff 40%);
		}
	}

	.bubble-shell h3 {
		font-size: 0.95rem;
		color: var(--soft);
	}

	.bubble-shell input {
		width: 100%;
	}

	.controls {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		flex-wrap: wrap;
	}

	.save-box {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.save-box input {
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 0.7rem;
		padding: 0.48rem 0.72rem;
		color: var(--text);
	}

	.drawer {
		position: relative;
		width: min(300px, 78vw);
		background: rgba(10, 15, 24, 0.56);
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 1rem;
		overflow: hidden;
		transition: width 0.25s ease;
	}

	.drawer.closed {
		width: 2.8rem;
	}

	.drawer-toggle {
		position: absolute;
		left: 0.4rem;
		top: 0.6rem;
		z-index: 2;
		background: rgba(255, 255, 255, 0.16);
	}

	.drawer-inner {
		padding: 0.9rem 0.9rem 1rem 3.2rem;
	}

	.drawer.closed .drawer-inner {
		display: none;
	}

	.empty {
		color: #cad2dc;
		font-size: 0.9rem;
		margin-top: 1rem;
	}

	.jar-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(92px, 1fr));
		gap: 0.75rem;
		margin-top: 0.8rem;
	}

	.jar {
		border: 1px solid rgba(255, 255, 255, 0.24);
		border-radius: 1rem;
		padding: 0.6rem 0.5rem;
		background: rgba(245, 254, 255, 0.08);
		cursor: pointer;
		color: #dceaf8;
	}

	.lid {
		width: 56%;
		height: 9px;
		margin: 0 auto;
		background: linear-gradient(180deg, #8b9eb2, #5f6f7f);
		border-radius: 0.4rem;
	}

	.liquid {
		position: relative;
		height: 64px;
		margin: 0.2rem auto 0.4rem;
		width: 72%;
		border-radius: 0.85rem;
		border: 1px solid rgba(202, 226, 255, 0.45);
		background: linear-gradient(
			180deg,
			rgba(206, 236, 255, 0.08) 0%,
			rgba(133, 203, 255, 0.14) calc(100% - var(--fill)),
			rgba(126, 177, 240, 0.42) 100%
		);
		box-shadow: inset 0 0 14px rgba(167, 217, 255, 0.22);
	}

	.jar p {
		font-size: 0.8rem;
		line-height: 1.2;
	}

	@media (max-width: 900px) {
		.workspace {
			grid-template-columns: 1fr;
		}

		.drawer {
			grid-row: 6;
			width: 100%;
		}

		.drawer.closed {
			width: 100%;
			height: 3.2rem;
		}

		.drawer-toggle {
			left: auto;
			right: 0.5rem;
		}
	}
</style>
