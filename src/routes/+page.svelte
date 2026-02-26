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

	const bubbleSeeds = [
		{ x: 16, y: 22 },
		{ x: 34, y: 63 },
		{ x: 52, y: 30 },
		{ x: 68, y: 58 },
		{ x: 80, y: 28 },
		{ x: 24, y: 44 }
	];

	const scenes = {
		sleep: {
			title: 'Sleep',
			subtitle: 'Settle into gentle, slower textures.',
			colors: {
				bgA: '#b8c6d2',
				bgB: '#d6e0e8',
				panel: 'rgba(247, 244, 238, 0.62)',
				bubble: '#efe5d9',
				text: '#4d4740',
				soft: '#776f66'
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
				bgA: '#bdcdbf',
				bgB: '#dbe6d9',
				panel: 'rgba(248, 245, 239, 0.62)',
				bubble: '#f0e8db',
				text: '#4d4941',
				soft: '#787268'
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
				bgA: '#d2bfb2',
				bgB: '#e9d9cf',
				panel: 'rgba(249, 245, 240, 0.62)',
				bubble: '#f3e8dc',
				text: '#4f4741',
				soft: '#7a7068'
			},
			presets: []
		}
	};

	let activeScene = 'sleep';
	let drawerOpen = true;
	let mixes = [];
	let mixLabel = '';

	let audioCtx;
	const engines = new Map();
	let bubbles = bubbleDefs.map((b, i) => ({
		...b,
		active: false,
		volume: 0.45,
		x: bubbleSeeds[i].x,
		y: bubbleSeeds[i].y,
		drift: (i % 3) * 1.15
	}));

	let dragState = null;
	let bubbleStageEl;
	let draggingMixId = null;
	let mixPointerDrag = null;
	let suppressJarClick = false;
	let activeJarKey = null;

	const presetJars = Object.entries(scenes).flatMap(([sceneKey, scene]) =>
		scene.presets.map((preset) => ({ ...preset, sceneKey }))
	);

	$: palette = scenes[activeScene].colors;
	$: activeCount = bubbles.filter((b) => b.active).length;

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

	function ensureContext() {
		if (!audioCtx) audioCtx = new AudioContext();
		if (audioCtx.state === 'suspended') audioCtx.resume();
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
		for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

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
			filter.type = 'lowpass';
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

	function startBubbleDrag(e, bubble) {
		if (!bubbleStageEl) return;
		const stageRect = bubbleStageEl.getBoundingClientRect();
		dragState = {
			id: bubble.id,
			startX: e.clientX,
			startY: e.clientY,
			originX: bubble.x,
			originY: bubble.y,
			stageWidth: stageRect.width,
			stageHeight: stageRect.height,
			moved: false
		};
		e.preventDefault();
		window.addEventListener('pointermove', onBubbleDrag);
		window.addEventListener('pointerup', stopBubbleDrag);
		window.addEventListener('pointercancel', stopBubbleDrag);
	}

	function onBubbleDrag(e) {
		if (!dragState) return;
		const deltaX = e.clientX - dragState.startX;
		const deltaY = e.clientY - dragState.startY;
		if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) dragState.moved = true;
		const nextX = dragState.originX + (deltaX / dragState.stageWidth) * 100;
		const nextY = dragState.originY + (deltaY / dragState.stageHeight) * 100;
		const clampedX = Math.max(8, Math.min(92, nextX));
		const clampedY = Math.max(16, Math.min(84, nextY));
		bubbles = bubbles.map((bubble) =>
			bubble.id === dragState.id ? { ...bubble, x: clampedX, y: clampedY } : bubble
		);
	}

	function stopBubbleDrag() {
		if (dragState && !dragState.moved) toggleBubble(dragState.id);
		dragState = null;
		window.removeEventListener('pointermove', onBubbleDrag);
		window.removeEventListener('pointerup', stopBubbleDrag);
		window.removeEventListener('pointercancel', stopBubbleDrag);
	}

	function adjustVolumeWithWheel(e, id) {
		const delta = e.deltaY < 0 ? 0.04 : -0.04;
		const current = bubbles.find((bubble) => bubble.id === id)?.volume ?? 0.45;
		setVolume(id, current + delta);
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

	function applyPresetJar(sceneKey, mix) {
		activeScene = sceneKey;
		applyPreset(mix);
	}

	function jarToneStyle(sceneKey) {
		const tone = scenes[sceneKey].colors;
		return `--lid-a:${tone.bgA};--lid-b:${tone.bgB};--jar:${tone.bubble};--jar-glow:${tone.bgB};`;
	}

	function jarLiquidStyle(mix) {
		return `--fill:${Math.max(15, Object.keys(mix).length * 18)}%;`;
	}

	function sceneTagStyle(sceneKey) {
		const tone = scenes[sceneKey].colors;
		return `--tag-bg:${tone.bgB};--tag-fg:${tone.text};--tag-border:${tone.bgA};`;
	}

	function clearAll() {
		bubbles = bubbles.map((bubble) => {
			updateEngineVolume(bubble.id, false, bubble.volume);
			return { ...bubble, active: false };
		});
		activeJarKey = null;
		void hardStopAudio();
	}

	function switchScene(sceneKey) {
		activeScene = sceneKey;
		activeJarKey = null;
	}

	function moveMixToTarget(dragId, targetId) {
		if (dragId === targetId) return;
		const fromIndex = mixes.findIndex((mix) => mix.id === dragId);
		const toIndex = mixes.findIndex((mix) => mix.id === targetId);
		if (fromIndex < 0 || toIndex < 0) return;
		const reordered = [...mixes];
		const [moved] = reordered.splice(fromIndex, 1);
		reordered.splice(toIndex, 0, moved);
		mixes = reordered;
	}

	function onMixPointerMove(event) {
		if (!mixPointerDrag) return;
		const dx = event.clientX - mixPointerDrag.startX;
		const dy = event.clientY - mixPointerDrag.startY;
		if (!mixPointerDrag.moved && Math.hypot(dx, dy) > 6) mixPointerDrag.moved = true;
	}

	function endMixPointerDrag() {
		if (mixPointerDrag?.moved) {
			suppressJarClick = true;
			setTimeout(() => {
				suppressJarClick = false;
			}, 0);
		}
		mixPointerDrag = null;
		draggingMixId = null;
		window.removeEventListener('pointermove', onMixPointerMove);
		window.removeEventListener('pointerup', endMixPointerDrag);
		window.removeEventListener('pointercancel', endMixPointerDrag);
	}

	function startMixPointerDrag(event, id) {
		if (event.button !== 0) return;
		mixPointerDrag = { id, startX: event.clientX, startY: event.clientY, moved: false };
		draggingMixId = id;
		window.addEventListener('pointermove', onMixPointerMove);
		window.addEventListener('pointerup', endMixPointerDrag);
		window.addEventListener('pointercancel', endMixPointerDrag);
	}

	function hoverMixTarget(targetId) {
		if (!mixPointerDrag?.moved || !draggingMixId) return;
		if (draggingMixId === targetId) return;
		moveMixToTarget(draggingMixId, targetId);
	}

	function handleSavedJarClick(jar) {
		if (suppressJarClick) return;
		const jarKey = `mix:${jar.id}`;
		if (activeJarKey === jarKey) {
			clearAll();
			return;
		}
		loadMix(jar);
		activeJarKey = jarKey;
	}

	function handlePresetJarClick(preset) {
		const jarKey = `preset:${preset.sceneKey}:${preset.name}`;
		if (activeJarKey === jarKey) {
			clearAll();
			return;
		}
		applyPresetJar(preset.sceneKey, preset.mix);
		activeJarKey = jarKey;
	}
</script>

<main class="workspace" style={`--bgA:${palette.bgA};--bgB:${palette.bgB};--panel:${palette.panel};--bubble:${palette.bubble};--text:${palette.text};--soft:${palette.soft};`}>
	<section class="top-row">
		<div>
			<h1>{scenes[activeScene].title} Scene</h1>
			<p>{scenes[activeScene].subtitle}</p>
		</div>
		<nav class="scene-nav" aria-label="Scene switcher">
			{#each Object.keys(scenes) as sceneKey}
				<button class:active={sceneKey === activeScene} style={sceneTagStyle(sceneKey)} on:click={() => switchScene(sceneKey)}>
					{scenes[sceneKey].title}
				</button>
			{/each}
		</nav>
	</section>

	<section class="bubble-stage" bind:this={bubbleStageEl} on:wheel|preventDefault>
		{#each bubbles as bubble}
			{@const scale = 0.8 + bubble.volume * 0.65}
			{@const opacity = 0.4 + bubble.volume * 0.6}
			<article class="bubble-shell" style={`--scale:${scale};--opacity:${opacity};--drift:${bubble.drift}s;left:${bubble.x}%;top:${bubble.y}%;`}>
				<button
					class="bubble"
					class:active={bubble.active}
					on:pointerdown={(e) => startBubbleDrag(e, bubble)}
					on:wheel|preventDefault={(e) => adjustVolumeWithWheel(e, bubble.id)}
					aria-pressed={bubble.active}
					aria-label={`${bubble.label}, ${Math.round(bubble.volume * 100)} percent volume`}
				>
					<span>{bubble.icon}</span>
				</button>
				<h3>{bubble.label}</h3>
				<p>{Math.round(bubble.volume * 100)}%</p>
			</article>
		{/each}
		<p class="bubble-hint">Drag to move, click to toggle, wheel to adjust volume.</p>
	</section>

	<section class="controls">
		<div class="save-box">
			<input type="text" bind:value={mixLabel} placeholder="Label this mix" maxlength="24" aria-label="Mix label" />
			<button on:click={saveMix}>Save to Cabinet</button>
		</div>
		<button class="clear" on:click={clearAll}>Stop all ({activeCount})</button>
	</section>

	<aside class="drawer" class:closed={!drawerOpen}>
		<button
			class="drawer-toggle"
			on:click={() => (drawerOpen = !drawerOpen)}
			aria-label={drawerOpen ? 'Collapse cabinet drawer' : 'Expand cabinet drawer'}
			title={drawerOpen ? 'Collapse cabinet drawer' : 'Expand cabinet drawer'}
		>
			{drawerOpen ? '>' : '<'}
		</button>
		<div class="drawer-inner">
			<h2>Cabinet</h2>
			<section class="cabinet-presets">
				<h3>Preset Jars</h3>
				<div class="jar-grid">
					{#each presetJars as preset}
						<button class="jar" style={jarToneStyle(preset.sceneKey)} on:click={() => handlePresetJarClick(preset)}>
							<div class="lid"></div>
							<div class="liquid" style={jarLiquidStyle(preset.mix)}></div>
							<p>{preset.name}</p>
						</button>
					{/each}
				</div>
			</section>

			{#if mixes.length === 0}
				<p class="empty">No jars yet. Save your current mix.</p>
			{:else}
				<section class="cabinet-mixes">
					<h3>Saved Mixes</h3>
					<div class="jar-grid">
						{#each mixes as jar}
							<button
								class="jar"
								class:dragging={draggingMixId === jar.id}
								style={jarToneStyle(jar.scene)}
								on:pointerdown={(event) => startMixPointerDrag(event, jar.id)}
								on:pointerenter={() => hoverMixTarget(jar.id)}
								on:click={() => handleSavedJarClick(jar)}
							>
								<div class="lid"></div>
								<div class="liquid" style={jarLiquidStyle(jar.mix)}></div>
								<p>{jar.label}</p>
							</button>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</aside>
</main>

<style>
	:global(html),
	:global(body) {
		height: 100%;
		overflow: hidden;
	}

	:global(body) {
		margin: 0;
		font-family: 'Avenir Next', 'Trebuchet MS', sans-serif;
		background: #050709;
		color: #fff;
	}

	main {
		height: 100dvh;
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	.workspace {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto 1fr auto;
		gap: 1.1rem;
		padding: 1.2rem 1.2rem 1.2rem 1.6rem;
		background: radial-gradient(circle at 10% 10%, var(--bgB) 0%, var(--bgA) 62%, #c8b9ac 100%);
		color: var(--text);
		box-sizing: border-box;
		overflow: hidden;
	}

	.top-row,
	.controls {
		grid-column: 1 / 2;
		padding: 0.5rem 0.2rem;
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
	.save-box button,
	.clear,
	.drawer-toggle {
		border: 1px solid var(--tag-border, rgba(255, 255, 255, 0.4));
		border-radius: 0.85rem;
		background: color-mix(in srgb, var(--tag-bg, #ffffff) 70%, #ffffff 30%);
		color: var(--tag-fg, var(--text));
		padding: 0.5rem 0.8rem;
		cursor: pointer;
	}

	.scene-nav button.active {
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7);
	}

	.bubble-stage {
		grid-column: 1 / 2;
		position: relative;
		min-height: clamp(420px, 66vh, 760px);
		border-radius: 1.15rem;
		overflow: hidden;
		background:
			radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.28), transparent 46%),
			radial-gradient(circle at 82% 84%, rgba(255, 255, 255, 0.22), transparent 40%),
			linear-gradient(165deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05));
		backdrop-filter: blur(10px);
	}

	.bubble-shell {
		position: absolute;
		transform: translate(-50%, -50%);
		display: grid;
		justify-items: center;
		gap: 0.4rem;
		animation: float 7s ease-in-out infinite;
		animation-delay: calc(var(--drift) * -1s);
	}

	.bubble {
		width: 84px;
		height: 84px;
		border: none;
		border-radius: 50%;
		background: color-mix(in srgb, var(--bubble) 86%, #ffffff 14%);
		color: #5a4f45;
		font-weight: 700;
		font-size: 1.1rem;
		opacity: var(--opacity);
		transform: scale(var(--scale)) translateZ(0);
		cursor: grab;
		position: relative;
		transition: transform 0.15s linear, opacity 0.15s linear, box-shadow 0.18s ease;
		touch-action: none;
		user-select: none;
		isolation: isolate;
	}

	.bubble::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		transform: translate(-50%, -50%) scale(1);
		background: radial-gradient(circle, color-mix(in srgb, var(--bubble) 52%, #fff 48%) 0%, transparent 68%);
		opacity: 0;
		pointer-events: none;
		z-index: -1;
	}

	.bubble:active {
		cursor: grabbing;
	}

	.bubble.active {
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.6),
			0 0 16px color-mix(in srgb, var(--bubble) 65%, #fff 35%),
			0 0 36px color-mix(in srgb, var(--bubble) 55%, #fff 45%);
		animation: aura 2.2s ease-in-out infinite;
	}

	.bubble.active::after {
		animation: aura-size 2.2s ease-in-out infinite;
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

	@keyframes aura-size {
		0%,
		100% {
			transform: translate(-50%, -50%) scale(1.05);
			opacity: 0.38;
		}
		50% {
			transform: translate(-50%, -50%) scale(1.34);
			opacity: 0.14;
		}
	}

	.bubble-shell h3 {
		font-size: 0.83rem;
		color: var(--soft);
		line-height: 1;
	}

	.bubble-shell p {
		margin: 0;
		font-size: 0.76rem;
		color: var(--soft);
		padding: 0.12rem 0.4rem;
		background: rgba(255, 255, 255, 0.26);
		border-radius: 999px;
	}

	.bubble-hint {
		position: absolute;
		left: 0.9rem;
		bottom: 0.7rem;
		margin: 0;
		font-size: 0.8rem;
		color: rgba(64, 57, 50, 0.72);
	}

	@keyframes float {
		0%,
		100% {
			transform: translate(-50%, -50%) translateY(0);
		}
		50% {
			transform: translate(-50%, -50%) translateY(-8px);
		}
	}

	.controls {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding-top: 0.2rem;
		padding-bottom: 0.2rem;
	}

	.save-box {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.save-box input {
		background: rgba(255, 255, 255, 0.28);
		border: 1px solid rgba(255, 255, 255, 0.44);
		border-radius: 0.7rem;
		padding: 0.38rem 0.62rem;
		color: var(--text);
	}

	.drawer {
		grid-column: 2 / 3;
		grid-row: 1 / -1;
		align-self: stretch;
		position: relative;
		width: min(300px, 78vw);
		height: 100%;
		background: rgba(244, 238, 229, 0.48);
		border: 1px solid rgba(255, 255, 255, 0.42);
		border-radius: 1rem;
		overflow: hidden;
		transition: width 0.25s ease;
	}

	.drawer.closed {
		width: 2.6rem;
	}

	.drawer-toggle {
		position: absolute;
		left: 0.28rem;
		top: 50%;
		transform: translateY(-50%);
		z-index: 5;
		background: transparent;
		border: none;
		width: 0.8rem;
		height: 1.6rem;
		padding: 0;
		border-radius: 0;
		font-size: 0.86rem;
		font-weight: 600;
		color: rgba(88, 76, 65, 0.86);
		transition: transform 0.18s ease, color 0.18s ease, opacity 0.18s ease;
		opacity: 0.72;
	}

	.drawer-toggle:hover {
		opacity: 1;
		color: rgba(76, 66, 57, 0.98);
		transform: translateY(-50%) scale(1.05);
	}

	.drawer-toggle:active {
		transform: translateY(-50%) scale(0.94);
	}

	.drawer.closed .drawer-toggle {
		animation: nudge 1.9s ease-in-out infinite;
	}

	@keyframes nudge {
		0%,
		100% {
			transform: translateY(-50%) translateX(0);
		}
		50% {
			transform: translateY(-50%) translateX(-2px);
		}
	}

	.drawer-inner {
		padding: 0.9rem 0.9rem 1rem 1.35rem;
		height: 100%;
		box-sizing: border-box;
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
	}

	.drawer.closed .drawer-inner {
		display: none;
	}

	.cabinet-presets {
		margin-top: 0.7rem;
		padding: 0.7rem;
		border-radius: 0.9rem;
		background: rgba(255, 255, 255, 0.22);
		border: 1px solid rgba(255, 255, 255, 0.38);
	}

	.cabinet-presets h3,
	.cabinet-mixes h3 {
		font-size: 0.9rem;
		color: #5b534a;
	}

	.cabinet-mixes {
		margin-top: 0.9rem;
	}

	.empty {
		color: #7a726a;
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
		border: 1px solid rgba(255, 255, 255, 0.48);
		border-radius: 1rem;
		padding: 0.6rem 0.5rem;
		background: rgba(255, 255, 255, 0.26);
		cursor: grab;
		color: #5e554c;
		user-select: none;
	}

	.jar:active {
		cursor: grabbing;
	}

	.jar.dragging {
		opacity: 0.56;
		transform: scale(0.97);
	}

	.lid {
		width: 56%;
		height: 9px;
		margin: 0 auto;
		background: linear-gradient(180deg, var(--lid-b, #8b9eb2), var(--lid-a, #5f6f7f));
		border-radius: 0.4rem;
	}

	.liquid {
		position: relative;
		height: 64px;
		margin: 0.2rem auto 0.4rem;
		width: 72%;
		border-radius: 0.85rem;
		border: 1px solid color-mix(in srgb, var(--jar, #d8cfc4) 56%, #ffffff 44%);
		background: linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.22) 0%,
			color-mix(in srgb, var(--jar, #d8cfc4) 34%, #ffffff 66%) calc(100% - var(--fill)),
			color-mix(in srgb, var(--jar-glow, #b9aca0) 74%, #ffffff 26%) 100%
		);
		box-shadow: inset 0 0 14px color-mix(in srgb, var(--jar, #d8cfc4) 40%, #ffffff 60%);
	}

	.jar p {
		font-size: 0.8rem;
		line-height: 1.2;
	}

	@media (max-width: 900px) {
		.workspace {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr auto auto;
		}

		.drawer {
			grid-column: 1 / 2;
			grid-row: 4;
			width: 100%;
		}

		.drawer.closed {
			width: 100%;
			height: 3.2rem;
		}

		.drawer-toggle {
			left: auto;
			right: 0.5rem;
			top: 50%;
		}

		.bubble-stage {
			min-height: 68vh;
		}

		.bubble {
			width: 74px;
			height: 74px;
		}
	}
</style>
