<script>
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import Matter from 'matter-js';
	import { FaceMeshBreathMonitor } from '$lib/breathing/handBreath.js';

	const bubbleDefs = [
		{ id: 'rain1', label: 'Rain 1', icon: 'R1' },
		{ id: 'ocean1', label: 'Ocean 1', icon: 'O1' },
		{ id: 'white1', label: 'White Noise', icon: 'WN' },
		{ id: 'waves1', label: 'Waves 1', icon: 'W1' },
		{ id: 'radio1', label: 'Radio Tuning', icon: 'RT' },
		{ id: 'rain2', label: 'Rain 2', icon: 'R2' },
		{ id: 'crowd1', label: 'Crowd 1', icon: 'C1' },
		{ id: 'bird1', label: 'Bird 1', icon: 'B1' },
		{ id: 'citytalk1', label: 'City Talk 1', icon: 'CT' }
	];

	const bubbleSeeds = [
		{ x: 16, y: 22 },
		{ x: 29, y: 35 },
		{ x: 12, y: 56 },
		{ x: 21, y: 74 },
		{ x: 42, y: 16 },
		{ x: 57, y: 76 },
		{ x: 75, y: 14 },
		{ x: 86, y: 44 },
		{ x: 61, y: 43 },
		{ x: 46, y: 54 }
	];

	const externalAudioUrls = {
		rain1:
			'https://duke.app.box.com/index.php?rm=box_download_shared_file&shared_name=jlf503jjfa3sk18tio0xxprbgnb5a3qc&file_id=f_2151786422151',
		ocean1:
			'https://duke.app.box.com/index.php?rm=box_download_shared_file&shared_name=qjbg2rr187rowjyw67hixcwd0i3t8vq0&file_id=f_2151802582857',
		white1:
			'https://duke.app.box.com/index.php?rm=box_download_shared_file&shared_name=kiy069mc7tfmsx9t40022fds8pjnvr2c&file_id=f_2151805468646',
		waves1:
			'https://duke.app.box.com/index.php?rm=box_download_shared_file&shared_name=du6gpvuho1be7qcuz6yfruuwxv5x6snq&file_id=f_2151800087153',
		radio1:
			'https://duke.app.box.com/index.php?rm=box_download_shared_file&shared_name=50slwydix1k99tq5ud6xvxla5brnzvuh&file_id=f_2151805182334',
		rain2:
			'https://duke.app.box.com/index.php?rm=box_download_shared_file&shared_name=4gzogcitq4eoi1yri7n5japobt874z5b&file_id=f_2151788344067',
		crowd1:
			'https://duke.app.box.com/index.php?rm=box_download_shared_file&shared_name=14b9fjhh8tqg5ouzeq2q0399s4y847oa&file_id=f_2151790018931',
		bird1:
			'https://duke.app.box.com/index.php?rm=box_download_shared_file&shared_name=iuixsga7zl5jqy29ynwdk47ee5qwbiv3&file_id=f_2151793717967',
		citytalk1:
			'https://duke.app.box.com/index.php?rm=box_download_shared_file&shared_name=8xswg594cbo3nagwhehvl6r1zdytv36y&file_id=f_2151802026132'
	};

	const calmScene = {
		title: 'Calm',
		subtitle: 'Blend and shape your sound bubbles freely.',
		colors: {
			bgA: '#0d2045',
			bgB: '#1e3f78',
			panel: 'rgba(146, 186, 255, 0.08)',
			bubble: '#9dccff',
			text: '#dbe9ff',
			soft: '#9db8e2'
		}
	};

	let drawerOpen = true;
	let mixes = [];
	let mixLabel = '';

	let physicsEngine;
	let physicsRunner;
	let wallBodies = [];
	const bubbleBodies = new Map();
	let nextBubbleUid = 1;
	let bubbles = bubbleDefs.map((b, i) => ({
		uid: nextBubbleUid++,
		label: b.label,
		icon: b.icon,
		sourceType: b.id,
		components: [b.id],
		active: false,
		volume: 0.45,
		seedX: bubbleSeeds[i].x,
		seedY: bubbleSeeds[i].y,
		x: null,
		y: null,
		radius: 42,
		mass: 42 * 42,
		pulseFrequency: 0.09 + (i % 4) * 0.015,
		engine: null,
		fusing: false,
		separating: false,
		noFuseUntil: 0,
		fusionScale: 1,
		fusionOpacity: 1,
		drift: (i % 3) * 1.15,
		bornAt: 0,
		vx: 0,
		vy: 0,
		ax: 0,
		ay: 0
	}));

	let dragState = null;
	let bubbleStageEl;
	let draggingMixId = null;
	let mixPointerDrag = null;
	let suppressJarClick = false;
	let activeJarKey = null;
	let rafId = null;
	let fusionAnimations = [];
	let separationAnimations = [];
	let fusionContactSince = new Map();
	let clock = 0;
	let lastFrameMs = 0;
	let breathTraining = false;
	let breathStartedAt = 0;
	let breathExpectedPhase = 'Inhale';
	let breathExpectedProgress = 0;
	let breathCountdown = 4;
	let breathCycleCount = 1;
	let breathDetectedPhase = 'Unknown';
	let breathFeedback = 'Start 4-7-8';
	let breathCorrect = false;
	let breathPermissionError = '';
	let breathVideoEl;
	let breathStream = null;
	let breathMonitor = null;
	let handCheckEnabled = false;
	let handDetected = false;
	let handCheckStatus = 'Hand check off';

	const breathSequence = [
		{ phase: 'Inhale', duration: 4 },
		{ phase: 'Hold', duration: 7 },
		{ phase: 'Exhale', duration: 8 }
	];
	const breathCycleDuration = breathSequence.reduce((sum, step) => sum + step.duration, 0);

	const labelBySource = Object.fromEntries(bubbleDefs.map((item) => [item.id, item.label]));

	$: palette = calmScene.colors;
	$: activeCount = bubbles.filter((b) => b.active).length;
	$: breathMasterBubble = buildBreathMasterBubble();

	function computeBreathGuide(nowSec) {
		const elapsed = Math.max(0, nowSec - breathStartedAt);
		const cycleElapsed = elapsed % breathCycleDuration;
		let cursor = 0;
		for (const step of breathSequence) {
			if (cycleElapsed <= cursor + step.duration) {
				const localElapsed = cycleElapsed - cursor;
				const progress = Math.max(0, Math.min(1, localElapsed / step.duration));
				return {
					phase: step.phase,
					progress,
					countdown: Math.max(1, Math.ceil(step.duration - localElapsed)),
					cycleCount: Math.floor(elapsed / breathCycleDuration) + 1
				};
			}
			cursor += step.duration;
		}
		return { phase: 'Exhale', progress: 1, countdown: 1, cycleCount: 1 };
	}

	function evaluateBreathCorrectness(expected, detected) {
		if (detected === 'Unknown' || detected === 'Calibrating') return false;
		if (expected === 'Hold') return detected !== 'Exhale';
		return expected === detected;
	}

	function breathingScale(phase, progress) {
		if (!breathTraining) return 1;
		if (phase === 'Inhale') return 0.9 + progress * 0.2;
		if (phase === 'Hold') return 1.1;
		return 1.1 - progress * 0.24;
	}

	function buildBreathMasterBubble() {
		const active = bubbles.filter((b) => b.active);
		const isPlaying = active.length > 0;
		const volume = isPlaying
			? active.reduce((sum, item) => sum + item.volume, 0) / Math.max(1, active.length)
			: 0.4;
		const names = [...new Set(active.flatMap((b) => b.components ?? [b.sourceType]))]
			.map((id) => labelBySource[id] ?? id);
		const label = isPlaying
			? names.length <= 2
				? names.join(' + ')
				: `${names[0]} + ${names.length - 1} more`
			: 'Breathing Bubble';
		const sourceCount = isPlaying ? names.length : 0;
		const namesText = isPlaying ? names.join(' · ') : 'No audio selected';
		return {
			isPlaying,
			volume,
			label,
			count: active.length,
			sourceCount,
			namesText
		};
	}

	async function ensureBreathMonitorRunning() {
		if (!browser) return false;
		breathPermissionError = '';
		try {
			if (!breathStream) {
				breathStream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: 'user' },
					audio: false
				});
			}
			if (breathVideoEl) {
				breathVideoEl.srcObject = breathStream;
				if (breathVideoEl.paused) await breathVideoEl.play();
			}
			if (!breathMonitor) {
				breathMonitor = new FaceMeshBreathMonitor();
				await breathMonitor.start(breathVideoEl, (result) => {
					breathDetectedPhase = result.phase;
					handDetected = !!result.handVisible;
					if (result.phase === 'Calibrating') handCheckStatus = 'Checking hand...';
					else if (result.phase === 'Unknown') handCheckStatus = 'Hand not detected';
					else handCheckStatus = 'Hand detected';
				});
			}
			return true;
		} catch (error) {
			breathPermissionError = 'Camera permission is required for breathing detection.';
			return false;
		}
	}

	function teardownBreathMonitor() {
		breathMonitor?.stop();
		breathMonitor = null;
		if (breathStream) {
			for (const track of breathStream.getTracks()) track.stop();
			breathStream = null;
		}
		if (breathVideoEl) breathVideoEl.srcObject = null;
	}

	async function startBreathTraining() {
		if (!browser || breathTraining) return;
		const ok = await ensureBreathMonitorRunning();
		if (!ok) {
			breathTraining = false;
			return;
		}
		breathStartedAt = clock;
		breathTraining = true;
		breathFeedback = 'Follow bubble rhythm';
	}

	function stopBreathTraining() {
		breathTraining = false;
		breathFeedback = 'Start 4-7-8';
		if (!handCheckEnabled) teardownBreathMonitor();
	}

	async function toggleHandCheck() {
		if (handCheckEnabled) {
			handCheckEnabled = false;
			handDetected = false;
			handCheckStatus = 'Hand check off';
			if (!breathTraining) teardownBreathMonitor();
			return;
		}
		const ok = await ensureBreathMonitorRunning();
		handCheckEnabled = ok;
		handCheckStatus = ok ? 'Checking hand...' : 'Hand check unavailable';
	}

	function toggleBreathTraining() {
		if (breathTraining) stopBreathTraining();
		else void startBreathTraining();
	}

	function initPhysics() {
		if (!bubbleStageEl) return;
		physicsEngine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
		physicsRunner = Matter.Runner.create();
		rebuildWalls();
		Matter.Runner.run(physicsRunner, physicsEngine);
	}

	function destroyPhysics() {
		if (!physicsEngine) return;
		for (const body of bubbleBodies.values()) {
			Matter.World.remove(physicsEngine.world, body);
		}
		bubbleBodies.clear();
		for (const wall of wallBodies) {
			Matter.World.remove(physicsEngine.world, wall);
		}
		wallBodies = [];
		if (physicsRunner) Matter.Runner.stop(physicsRunner);
		physicsRunner = null;
		physicsEngine = null;
	}

	function rebuildWalls() {
		if (!physicsEngine || !bubbleStageEl) return;
		for (const wall of wallBodies) Matter.World.remove(physicsEngine.world, wall);
		wallBodies = [];
		const rect = bubbleStageEl.getBoundingClientRect();
		const thickness = 80;
		wallBodies = [
			Matter.Bodies.rectangle(rect.width / 2, -thickness / 2, rect.width + thickness * 2, thickness, {
				isStatic: true
			}),
			Matter.Bodies.rectangle(rect.width / 2, rect.height + thickness / 2, rect.width + thickness * 2, thickness, {
				isStatic: true
			}),
			Matter.Bodies.rectangle(-thickness / 2, rect.height / 2, thickness, rect.height + thickness * 2, {
				isStatic: true
			}),
			Matter.Bodies.rectangle(rect.width + thickness / 2, rect.height / 2, thickness, rect.height + thickness * 2, {
				isStatic: true
			})
		];
		Matter.World.add(physicsEngine.world, wallBodies);
	}

	function attachBody(bubble) {
		if (!physicsEngine || bubbleBodies.has(bubble.uid) || bubble.x === null || bubble.y === null) return;
		const body = Matter.Bodies.circle(bubble.x, bubble.y, bubble.radius, {
			restitution: 0.08,
			frictionAir: 0.085,
			friction: 0.035,
			frictionStatic: 0.1,
			density: 0.0011
		});
		body.label = `bubble:${bubble.uid}`;
		bubbleBodies.set(bubble.uid, body);
		Matter.World.add(physicsEngine.world, body);
	}

	function detachBody(uid) {
		const body = bubbleBodies.get(uid);
		if (!body || !physicsEngine) return;
		Matter.World.remove(physicsEngine.world, body);
		bubbleBodies.delete(uid);
	}

	function syncBodies() {
		if (!physicsEngine) return false;
		let changed = false;
		const alive = new Set(bubbles.map((b) => b.uid));
		for (const uid of bubbleBodies.keys()) {
			if (!alive.has(uid)) detachBody(uid);
		}
		for (const bubble of bubbles) {
			if (bubble.fusing || bubble.separating) {
				detachBody(bubble.uid);
				continue;
			}
			attachBody(bubble);
			const body = bubbleBodies.get(bubble.uid);
			if (!body) continue;
			const dx = body.position.x - bubble.x;
			const dy = body.position.y - bubble.y;
			const vx = body.velocity.x;
			const vy = body.velocity.y;
			const ax = (vx - (bubble.vx ?? 0)) * 60;
			const ay = (vy - (bubble.vy ?? 0)) * 60;
			if (
				Math.abs(dx) > 0.01 ||
				Math.abs(dy) > 0.01 ||
				Math.abs(vx - (bubble.vx ?? 0)) > 0.001 ||
				Math.abs(vy - (bubble.vy ?? 0)) > 0.001
			) {
				bubble.x = body.position.x;
				bubble.y = body.position.y;
				bubble.vx = vx;
				bubble.vy = vy;
				bubble.ax = ax;
				bubble.ay = ay;
				changed = true;
			}
		}
		return changed;
	}

	function applyDragForce(dt) {
		if (!dragState || !physicsEngine) return false;
		const bubble = bubbles.find((candidate) => candidate.uid === dragState.uid);
		const body = bubble ? bubbleBodies.get(bubble.uid) : null;
		if (!bubble || !body) return false;
		const dx = dragState.targetX - body.position.x;
		const dy = dragState.targetY - body.position.y;
		const distance = Math.hypot(dx, dy);
		if (distance < 0.01) return false;
		const nx = dx / distance;
		const ny = dy / distance;
		const spring = 0.00009;
		const maxPull = 0.00035;
		const pull = Math.min(distance * spring, maxPull);
		const damping = 0.22;
		const fx = nx * pull - body.velocity.x * damping * 0.00008;
		const fy = ny * pull - body.velocity.y * damping * 0.00008;
		Matter.Body.applyForce(body, body.position, { x: fx * dt, y: fy * dt });
		const dragMaxSpeed = 2.2;
		const speed = Math.hypot(body.velocity.x, body.velocity.y);
		if (speed > dragMaxSpeed) {
			const ratio = dragMaxSpeed / speed;
			Matter.Body.setVelocity(body, {
				x: body.velocity.x * ratio,
				y: body.velocity.y * ratio
			});
		}
		return Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05;
	}

	function applyPairAttraction(dt, nowMs) {
		if (!physicsEngine) return false;
		let changed = false;
		for (let i = 0; i < bubbles.length; i += 1) {
			for (let j = i + 1; j < bubbles.length; j += 1) {
				const a = bubbles[i];
				const b = bubbles[j];
				if (a.fusing || b.fusing || a.separating || b.separating || nowMs < a.noFuseUntil || nowMs < b.noFuseUntil) {
					continue;
				}
				const bodyA = bubbleBodies.get(a.uid);
				const bodyB = bubbleBodies.get(b.uid);
				if (!bodyA || !bodyB) continue;
				const dx = bodyB.position.x - bodyA.position.x;
				const dy = bodyB.position.y - bodyA.position.y;
				const distance = Math.hypot(dx, dy) || 1;
				const overlap = circleOverlapRatio(a, b);
				const draggedPair = dragState && (dragState.uid === a.uid || dragState.uid === b.uid);
				const minGap = a.radius + b.radius + 12;
				const interactionRange = (a.radius + b.radius) * 1.28;
				if (distance > interactionRange || distance < 1) continue;
				const nx = dx / distance;
				const ny = dy / distance;

				// Keep a minimum gap so attraction never causes visible overlap.
				// If user is actively dragging one bubble into another, ease repel to allow intentional fusion.
				if (distance <= minGap && !(draggedPair && distance <= a.radius + b.radius + 6)) {
					const repel = (minGap - distance) * 0.0000018 * dt;
					Matter.Body.applyForce(bodyA, bodyA.position, { x: -nx * repel, y: -ny * repel });
					Matter.Body.applyForce(bodyB, bodyB.position, { x: nx * repel, y: ny * repel });
					changed = true;
					continue;
				}

				const pull = 1 - distance / interactionRange;
				const forceMag = pull * 0.0000011 * Math.sqrt(a.mass * b.mass);
				const force = { x: nx * forceMag * dt, y: ny * forceMag * dt };
				Matter.Body.applyForce(bodyA, bodyA.position, force);
				Matter.Body.applyForce(bodyB, bodyB.position, { x: -force.x, y: -force.y });
				changed = true;
			}
		}
		return changed;
	}

	function containBodies() {
		if (!bubbleStageEl) return false;
		const width = bubbleStageEl.clientWidth;
		const height = bubbleStageEl.clientHeight;
		let changed = false;
		for (const bubble of bubbles) {
			const body = bubbleBodies.get(bubble.uid);
			if (!body) continue;
			let bodyChanged = false;
			const r = bubble.radius;
			let x = body.position.x;
			let y = body.position.y;
			let vx = body.velocity.x;
			let vy = body.velocity.y;

			// Keep bodies inside stage bounds to prevent tunneling through walls at high speed.
			if (x < r) {
				x = r;
				vx = Math.max(0, Math.abs(vx) * 0.18);
				bodyChanged = true;
			} else if (x > width - r) {
				x = width - r;
				vx = -Math.max(0, Math.abs(vx) * 0.18);
				bodyChanged = true;
			}
			if (y < r) {
				y = r;
				vy = Math.max(0, Math.abs(vy) * 0.18);
				bodyChanged = true;
			} else if (y > height - r) {
				y = height - r;
				vy = -Math.max(0, Math.abs(vy) * 0.18);
				bodyChanged = true;
			}

			const speed = Math.hypot(vx, vy);
			const maxSpeed = 2.4;
			if (speed > maxSpeed) {
				const ratio = maxSpeed / speed;
				vx *= ratio;
				vy *= ratio;
				bodyChanged = true;
			}

			if (bodyChanged) {
				Matter.Body.setPosition(body, { x, y });
				Matter.Body.setVelocity(body, { x: vx, y: vy });
				changed = true;
			}
		}
		return changed;
	}

	function destroyAllEngines() {
		for (const bubble of bubbles) {
			try {
				bubble.engine?.dispose();
			} catch {
				// best effort
			}
			bubble.engine = null;
		}
	}

	async function hardStopAudio() {
		destroyAllEngines();
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

		const start = () => {
			seedBubblePositions();
			initPhysics();
			syncBodies();
			rafId = requestAnimationFrame(runFusionLoop);
		};
		setTimeout(start, 0);

		const onResize = () => {
			rebuildWalls();
		};
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
		};
	});

	onDestroy(() => {
		if (rafId) cancelAnimationFrame(rafId);
		destroyPhysics();
		void hardStopAudio();
		stopBreathTraining();
		teardownBreathMonitor();
	});

	$: if (browser && mixes) {
		localStorage.setItem('calm-mixes', JSON.stringify(mixes));
	}

	function createExternalAudioEngine(type) {
		const externalUrl = externalAudioUrls[type];
		if (!externalUrl) return null;
		const mediaEl = new Audio(externalUrl);
		let fadeTimer;
		mediaEl.loop = true;
		mediaEl.preload = 'auto';
		mediaEl.volume = 0;
		void mediaEl.play().catch(() => {
			// autoplay can fail until first gesture
		});

		return {
			mediaEl,
			setVolume(v) {
				mediaEl.volume = Math.max(0, Math.min(1, v));
			},
			fadeTo(v, seconds = 0.7) {
				const target = Math.max(0, Math.min(1, v));
				if (fadeTimer) clearInterval(fadeTimer);
				const steps = Math.max(1, Math.round(seconds * 30));
				const start = mediaEl.volume;
				let index = 0;
				fadeTimer = setInterval(() => {
					index += 1;
					const t = Math.min(1, index / steps);
					mediaEl.volume = start + (target - start) * t;
					if (t >= 1) {
						clearInterval(fadeTimer);
						fadeTimer = null;
					}
				}, 1000 / 30);
			},
			dispose() {
				if (fadeTimer) clearInterval(fadeTimer);
				mediaEl.pause();
				mediaEl.src = '';
				mediaEl.load();
			}
		};
	}

	function seedBubblePositions() {
		if (!bubbleStageEl) return;
		const rect = bubbleStageEl.getBoundingClientRect();
		bubbles = bubbles.map((bubble) => {
			if (bubble.x !== null && bubble.y !== null) return bubble;
			return {
				...bubble,
				x: (bubble.seedX / 100) * rect.width,
				y: (bubble.seedY / 100) * rect.height
			};
		});
	}

	function attachEngineToBubble(bubble, engine) {
		bubble.engine = engine;
	}

	function ensureBubbleEngine(bubble) {
		if (bubble.engine) return;
		const engine = createExternalAudioEngine(bubble.sourceType);
		if (!engine) return;
		attachEngineToBubble(bubble, engine);
	}

	function updateBubbleAudio(bubble, useFadeSeconds = 0.08) {
		if (!bubble.active) {
			if (bubble.engine) {
				bubble.engine.dispose();
				bubble.engine = null;
			}
			return;
		}
		ensureBubbleEngine(bubble);
		if (bubble.engine?.fadeTo) {
			bubble.engine.fadeTo(bubble.volume * 0.35, useFadeSeconds);
		}
	}

	function toggleBubble(uid) {
		bubbles = bubbles.map((bubble) => {
			if (bubble.uid !== uid) return bubble;
			const next = { ...bubble, active: !bubble.active };
			updateBubbleAudio(next);
			return next;
		});
	}

	function setVolume(uid, rawValue) {
		const value = Math.max(0, Math.min(1, Number(rawValue)));
		bubbles = bubbles.map((bubble) => {
			if (bubble.uid !== uid) return bubble;
			const next = { ...bubble, volume: value };
			updateBubbleAudio(next);
			return next;
		});
	}

	function applyMix(mix) {
		bubbles = bubbles.map((bubble) => {
			const value = mix[bubble.sourceType] ?? 0;
			const next = { ...bubble, volume: value || bubble.volume, active: value > 0 };
			updateBubbleAudio(next);
			return next;
		});
	}

	function circleOverlapRatio(a, b) {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const d = Math.hypot(dx, dy);
		const r1 = a.radius;
		const r2 = b.radius;
		if (d >= r1 + r2) return 0;
		if (d <= Math.abs(r1 - r2)) return 1;

		const r1Sq = r1 * r1;
		const r2Sq = r2 * r2;
		const alpha = Math.acos((d * d + r1Sq - r2Sq) / (2 * d * r1));
		const beta = Math.acos((d * d + r2Sq - r1Sq) / (2 * d * r2));
		const overlap =
			r1Sq * alpha +
			r2Sq * beta -
			0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
		const minArea = Math.PI * Math.min(r1Sq, r2Sq);
		return overlap / minArea;
	}

	function easeInOutCubic(t) {
		return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
	}

	function easeOutCubic(t) {
		return 1 - Math.pow(1 - t, 3);
	}

	function formatBubbleLabel(components) {
		if (!components?.length) return 'Blend';
		const unique = [...new Set(components)];
		if (unique.length === 1) return labelBySource[unique[0]] ?? unique[0];
		const names = unique.map((source) => labelBySource[source] ?? source);
		if (names.length <= 3) return names.join(' + ');
		return `${names.slice(0, 2).join(' + ')} +${names.length - 2}`;
	}

	function startFusion(a, b, nowMs) {
		if (!a || !b || a.fusing || b.fusing) return false;
		const duration = 600 + Math.random() * 200;
		const midX = (a.x + b.x) / 2;
		const midY = (a.y + b.y) / 2;
		const newMass = a.mass + b.mass;
		const newRadius = Math.sqrt(newMass);
		const newPulseFrequency = (a.pulseFrequency * a.mass + b.pulseFrequency * b.mass) / newMass;
		const mergedVolume = (a.volume * a.mass + b.volume * b.mass) / newMass;
		const dominantSource = a.mass >= b.mass ? a.sourceType : b.sourceType;

		a.fusing = true;
		b.fusing = true;

		const mergedBubble = {
			uid: nextBubbleUid++,
			label: formatBubbleLabel([...a.components, ...b.components]),
			icon: '●',
			sourceType: dominantSource,
			components: [...a.components, ...b.components],
			active: a.active || b.active,
			volume: mergedVolume,
			seedX: 0,
			seedY: 0,
			x: midX,
			y: midY,
			radius: newRadius,
			mass: newMass,
			pulseFrequency: newPulseFrequency,
			engine: null,
			fusing: false,
			separating: false,
			noFuseUntil: 0,
			fusionScale: 1,
			fusionOpacity: 1,
			drift: ((a.drift ?? 0) + (b.drift ?? 0)) / 2,
			bornAt: clock,
			vx: 0,
			vy: 0,
			ax: 0,
			ay: 0
		};

		if (mergedBubble.active) {
			ensureBubbleEngine(mergedBubble);
			mergedBubble.engine?.fadeTo(mergedBubble.volume * 0.35, duration / 1000);
		}
		a.engine?.fadeTo(0, duration / 1000);
		b.engine?.fadeTo(0, duration / 1000);

		fusionAnimations.push({
			aUid: a.uid,
			bUid: b.uid,
			startMs: nowMs,
			durationMs: duration,
			startAX: a.x,
			startAY: a.y,
			startBX: b.x,
			startBY: b.y,
			midX,
			midY,
			mergedBubble
		});
		return true;
	}

	function advanceFusionAnimations(nowMs) {
		let changed = false;
		const completed = [];
		for (const anim of fusionAnimations) {
			const a = bubbles.find((bubble) => bubble.uid === anim.aUid);
			const b = bubbles.find((bubble) => bubble.uid === anim.bUid);
			if (!a || !b) {
				completed.push(anim);
				continue;
			}
			const raw = Math.min(1, (nowMs - anim.startMs) / anim.durationMs);
			const eased = easeInOutCubic(raw);
			a.x = anim.startAX + (anim.midX - anim.startAX) * eased;
			a.y = anim.startAY + (anim.midY - anim.startAY) * eased;
			b.x = anim.startBX + (anim.midX - anim.startBX) * eased;
			b.y = anim.startBY + (anim.midY - anim.startBY) * eased;
			a.fusionScale = 1 - 0.35 * eased;
			b.fusionScale = 1 - 0.35 * eased;
			a.fusionOpacity = 1 - 0.7 * eased;
			b.fusionOpacity = 1 - 0.7 * eased;
			changed = true;
			if (raw >= 1) completed.push(anim);
		}

		for (const anim of completed) {
			const oldA = bubbles.find((bubble) => bubble.uid === anim.aUid);
			const oldB = bubbles.find((bubble) => bubble.uid === anim.bUid);
			oldA?.engine?.dispose();
			oldB?.engine?.dispose();
			bubbles = bubbles.filter((bubble) => bubble.uid !== anim.aUid && bubble.uid !== anim.bUid);
			bubbles = [...bubbles, anim.mergedBubble];
			fusionAnimations = fusionAnimations.filter((candidate) => candidate !== anim);
			changed = true;
		}
		return changed;
	}

	function startSeparation(parent, nowMs) {
		if (!parent || parent.fusing || parent.separating) return false;
		const canSplit = parent.components.length > 1;
		if (!canSplit) return false;

		const duration = 520 + Math.random() * 140;
		const massA = parent.mass * 0.5;
		const massB = parent.mass - massA;
		const radiusA = Math.sqrt(massA);
		const radiusB = Math.sqrt(massB);
		const angle = Math.random() * Math.PI * 2;
		const offset = Math.min(62, Math.max(40, parent.radius * 0.68));
		const minSafeDistance = radiusA + radiusB + 12;
		const launchDistance = Math.max(offset * 2, minSafeDistance);
		const targetAX = parent.x + Math.cos(angle) * (launchDistance / 2);
		const targetAY = parent.y + Math.sin(angle) * (launchDistance / 2);
		const targetBX = parent.x - Math.cos(angle) * (launchDistance / 2);
		const targetBY = parent.y - Math.sin(angle) * (launchDistance / 2);
		const noFuseUntil = nowMs + duration + 450;

		const splitAt = 1;
		const compA = parent.components.slice(0, splitAt);
		const compB = parent.components.slice(splitAt);
		if (!compA.length || !compB.length) return false;
		const srcA = compA[0] ?? parent.sourceType;
		const srcB = compB[0] ?? parent.sourceType;

		const childA = {
			uid: nextBubbleUid++,
			label: formatBubbleLabel(compA),
			icon: '◍',
			sourceType: srcA,
			components: compA.length ? compA : [srcA],
			active: parent.active,
			volume: parent.volume,
			seedX: 0,
			seedY: 0,
			x: parent.x,
			y: parent.y,
			radius: radiusA,
			mass: massA,
			pulseFrequency: Math.max(0.04, parent.pulseFrequency * 0.92),
			engine: null,
			fusing: false,
			separating: true,
			noFuseUntil,
			fusionScale: 0.88,
			fusionOpacity: 0,
			drift: parent.drift - 0.4,
			bornAt: clock,
			vx: 0,
			vy: 0,
			ax: 0,
			ay: 0
		};

		const childB = {
			uid: nextBubbleUid++,
			label: formatBubbleLabel(compB),
			icon: '◍',
			sourceType: srcB,
			components: compB.length ? compB : [srcB],
			active: parent.active,
			volume: parent.volume,
			seedX: 0,
			seedY: 0,
			x: parent.x,
			y: parent.y,
			radius: radiusB,
			mass: massB,
			pulseFrequency: parent.pulseFrequency * 1.08,
			engine: null,
			fusing: false,
			separating: true,
			noFuseUntil,
			fusionScale: 0.88,
			fusionOpacity: 0,
			drift: parent.drift + 0.4,
			bornAt: clock,
			vx: 0,
			vy: 0,
			ax: 0,
			ay: 0
		};

		parent.separating = true;

		if (parent.active) {
			ensureBubbleEngine(childA);
			ensureBubbleEngine(childB);
			childA.engine?.fadeTo(childA.volume * 0.2, duration / 1000);
			childB.engine?.fadeTo(childB.volume * 0.2, duration / 1000);
			parent.engine?.fadeTo(0, duration / 1000);
		}

		bubbles = [...bubbles, childA, childB];
		separationAnimations.push({
			parentUid: parent.uid,
			childAUid: childA.uid,
			childBUid: childB.uid,
			startMs: nowMs,
			durationMs: duration,
			startX: parent.x,
			startY: parent.y,
			targetAX,
			targetAY,
			targetBX,
			targetBY
		});
		return true;
	}

	function advanceSeparationAnimations(nowMs) {
		let changed = false;
		const completed = [];
		for (const anim of separationAnimations) {
			const parent = bubbles.find((bubble) => bubble.uid === anim.parentUid);
			const childA = bubbles.find((bubble) => bubble.uid === anim.childAUid);
			const childB = bubbles.find((bubble) => bubble.uid === anim.childBUid);
			if (!parent || !childA || !childB) {
				completed.push(anim);
				continue;
			}
			const raw = Math.min(1, (nowMs - anim.startMs) / anim.durationMs);
			const eased = easeInOutCubic(raw);
			childA.x = anim.startX + (anim.targetAX - anim.startX) * eased;
			childA.y = anim.startY + (anim.targetAY - anim.startY) * eased;
			childB.x = anim.startX + (anim.targetBX - anim.startX) * eased;
			childB.y = anim.startY + (anim.targetBY - anim.startY) * eased;
			childA.fusionOpacity = eased;
			childB.fusionOpacity = eased;
			childA.fusionScale = 0.88 + 0.12 * eased;
			childB.fusionScale = 0.88 + 0.12 * eased;
			parent.fusionScale = 1 - 0.22 * eased;
			parent.fusionOpacity = 1 - eased;
			changed = true;
			if (raw >= 1) completed.push(anim);
		}

		for (const anim of completed) {
			const parent = bubbles.find((bubble) => bubble.uid === anim.parentUid);
			parent?.engine?.dispose();
			bubbles = bubbles.filter((bubble) => bubble.uid !== anim.parentUid);
			bubbles = bubbles.map((bubble) =>
				bubble.uid === anim.childAUid || bubble.uid === anim.childBUid
					? { ...bubble, separating: false, fusionScale: 1, fusionOpacity: 1 }
					: bubble
			);
			separationAnimations = separationAnimations.filter((candidate) => candidate !== anim);
			changed = true;
		}
		return changed;
	}

	function detectFusion(nowMs) {
		if (fusionAnimations.length) {
			fusionContactSince.clear();
			return false;
		}
		const seenKeys = new Set();
		for (let i = 0; i < bubbles.length; i += 1) {
			for (let j = i + 1; j < bubbles.length; j += 1) {
				const a = bubbles[i];
				const b = bubbles[j];
				const pairKey = a.uid < b.uid ? `${a.uid}:${b.uid}` : `${b.uid}:${a.uid}`;
				seenKeys.add(pairKey);
				if (a.fusing || b.fusing || a.separating || b.separating || a.x === null || b.x === null) {
					fusionContactSince.delete(pairKey);
					continue;
				}
				if (nowMs < (a.noFuseUntil ?? 0) || nowMs < (b.noFuseUntil ?? 0)) {
					fusionContactSince.delete(pairKey);
					continue;
				}
				const dx = (a.x ?? 0) - (b.x ?? 0);
				const dy = (a.y ?? 0) - (b.y ?? 0);
				const distance = Math.hypot(dx, dy);
				const overlap = circleOverlapRatio(a, b);
				const draggedPair = dragState && (dragState.uid === a.uid || dragState.uid === b.uid);
				const dragTouchDistance = a.radius + b.radius + 5;
				const closeEnough = draggedPair ? distance <= dragTouchDistance : overlap > 0.48;
				if (!closeEnough) {
					fusionContactSince.delete(pairKey);
					continue;
				}
				const relativeSpeed = Math.hypot((a.vx ?? 0) - (b.vx ?? 0), (a.vy ?? 0) - (b.vy ?? 0));
				const speedThreshold = draggedPair ? 2.8 : 2.1;
				if (relativeSpeed > speedThreshold) {
					fusionContactSince.delete(pairKey);
					continue;
				}
				const contactStart = fusionContactSince.get(pairKey) ?? nowMs;
				if (!fusionContactSince.has(pairKey)) fusionContactSince.set(pairKey, contactStart);
				const holdMs = draggedPair ? 320 : 170;
				if (nowMs - contactStart >= holdMs) {
					fusionContactSince.delete(pairKey);
					return startFusion(a, b, nowMs);
				}
			}
		}
		for (const key of fusionContactSince.keys()) {
			if (!seenKeys.has(key)) fusionContactSince.delete(key);
		}
		return false;
	}

	function runFusionLoop(nowMs) {
		clock = nowMs / 1000;
		if (breathTraining) {
			const guide = computeBreathGuide(clock);
			breathExpectedPhase = guide.phase;
			breathExpectedProgress = guide.progress;
			breathCountdown = guide.countdown;
			breathCycleCount = guide.cycleCount;
			breathCorrect = evaluateBreathCorrectness(breathExpectedPhase, breathDetectedPhase);
			if (breathDetectedPhase === 'Calibrating') {
				breathFeedback = 'Calibrating hand... keep one hand visible';
			} else if (breathDetectedPhase === 'Unknown') {
				breathFeedback = 'Hand not detected';
			} else {
				breathFeedback = breathCorrect ? 'Great rhythm' : 'Adjust breath to bubble';
			}
		}
		const dt = Math.min(2.2, Math.max(0.6, (nowMs - (lastFrameMs || nowMs)) / 16.67));
		lastFrameMs = nowMs;
		const dragForced = applyDragForce(dt);
		const attracted = applyPairAttraction(dt, nowMs);
		const contained = containBodies();
		const bodySyncChanged = syncBodies();
		const animated = advanceFusionAnimations(nowMs);
		const separated = advanceSeparationAnimations(nowMs);
		const fused = detectFusion(nowMs);
		if (dragForced || attracted || contained || bodySyncChanged || animated || separated || fused) bubbles = [...bubbles];
		rafId = requestAnimationFrame(runFusionLoop);
	}

	function startBubbleDrag(e, bubble) {
		if (bubble.fusing || bubble.separating || bubble.x === null || bubble.y === null) return;
		if (!bubbleStageEl) return;
		const stageRect = bubbleStageEl.getBoundingClientRect();
		dragState = {
			uid: bubble.uid,
			startX: e.clientX,
			startY: e.clientY,
			originX: bubble.x,
			originY: bubble.y,
			targetX: bubble.x,
			targetY: bubble.y,
			stageWidth: stageRect.width,
			stageHeight: stageRect.height,
			moved: false
		};
		const body = bubbleBodies.get(bubble.uid);
		if (body) {
			Matter.Body.setVelocity(body, { x: body.velocity.x * 0.22, y: body.velocity.y * 0.22 });
			Matter.Body.setAngularVelocity(body, 0);
		}
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
		const bubble = bubbles.find((candidate) => candidate.uid === dragState.uid);
		if (!bubble) return;
		const clampedX = Math.max(
			bubble.radius,
			Math.min(dragState.stageWidth - bubble.radius, dragState.originX + deltaX)
		);
		const clampedY = Math.max(
			bubble.radius,
			Math.min(dragState.stageHeight - bubble.radius, dragState.originY + deltaY)
		);
		dragState.targetX = clampedX;
		dragState.targetY = clampedY;
		const body = bubbleBodies.get(dragState.uid);
		if (body) {
			const prevX = body.position.x;
			const prevY = body.position.y;
			const nextX = body.position.x + (clampedX - body.position.x) * 0.22;
			const nextY = body.position.y + (clampedY - body.position.y) * 0.22;
			Matter.Body.setPosition(body, { x: nextX, y: nextY });
			Matter.Body.setVelocity(body, {
				x: (nextX - prevX) * 0.55,
				y: (nextY - prevY) * 0.55
			});
		}
	}

	function stopBubbleDrag() {
		if (dragState && !dragState.moved) toggleBubble(dragState.uid);
		if (dragState) {
			const body = bubbleBodies.get(dragState.uid);
			if (body) Matter.Body.setVelocity(body, { x: body.velocity.x * 0.1, y: body.velocity.y * 0.1 });
		}
		dragState = null;
		window.removeEventListener('pointermove', onBubbleDrag);
		window.removeEventListener('pointerup', stopBubbleDrag);
		window.removeEventListener('pointercancel', stopBubbleDrag);
	}

	function adjustVolumeWithWheel(e, uid) {
		const delta = e.deltaY < 0 ? 0.04 : -0.04;
		const current = bubbles.find((bubble) => bubble.uid === uid)?.volume ?? 0.45;
		setVolume(uid, current + delta);
	}

	function saveMix() {
		const snapshot = {};
		for (const bubble of bubbles) {
			if (!bubble.active) continue;
			const value = Number(bubble.volume.toFixed(2));
			const keys = bubble.components?.length ? [...new Set(bubble.components)] : [bubble.sourceType];
			for (const key of keys) {
				snapshot[key] = Math.max(snapshot[key] ?? 0, value);
			}
		}
		if (!Object.keys(snapshot).length) return;
		const label = mixLabel.trim() || `Jar ${mixes.length + 1}`;
		mixes = [{ label, mix: snapshot, id: Date.now() }, ...mixes];
		mixLabel = '';
	}

	function loadMix(jar) {
		applyMix(jar.mix);
	}

	function jarToneStyle() {
		const tone = calmScene.colors;
		return `--lid-a:${tone.bgA};--lid-b:${tone.bgB};--jar:${tone.bubble};--jar-glow:${tone.bgB};`;
	}

	function jarLiquidStyle(mix) {
		return `--fill:${Math.max(15, Object.keys(mix).length * 18)}%;`;
	}

	function clearAll() {
		bubbles = bubbles.map((bubble) => {
			const next = {
				...bubble,
				active: false,
				fusing: false,
				separating: false,
				fusionScale: 1,
				fusionOpacity: 1
			};
			updateBubbleAudio(next);
			return next;
		});
		fusionAnimations = [];
		separationAnimations = [];
		activeJarKey = null;
		void hardStopAudio();
	}

	function handleBubbleDoubleClick(uid) {
		const bubble = bubbles.find((candidate) => candidate.uid === uid);
		if (!bubble) return;
		startSeparation(bubble, performance.now());
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

	function removeMix(id) {
		mixes = mixes.filter((mix) => mix.id !== id);
		if (activeJarKey === `mix:${id}`) activeJarKey = null;
		if (draggingMixId === id) draggingMixId = null;
		if (mixPointerDrag?.id === id) mixPointerDrag = null;
	}
</script>

<main class="workspace" style={`--bgA:${palette.bgA};--bgB:${palette.bgB};--panel:${palette.panel};--bubble:${palette.bubble};--text:${palette.text};--soft:${palette.soft};`}>
	<section class="top-row">
		<div>
			<h1>{calmScene.title}</h1>
			<p>{calmScene.subtitle}</p>
		</div>
		<div class="breath-panel">
			<div class="breath-actions">
				<button class="breath-btn" class:active={handCheckEnabled} on:click={toggleHandCheck}>
					{handCheckEnabled ? 'Stop Check' : 'Check Hand'}
				</button>
				<button class="breath-btn" class:active={breathTraining} on:click={toggleBreathTraining}>
				{breathTraining ? 'Stop 4-7-8' : 'Start 4-7-8'}
			</button>
			</div>
			{#if handCheckEnabled}
				<p class="breath-text" class:ok={handDetected} class:warn={!handDetected}>
					{handCheckStatus}
				</p>
			{/if}
			{#if !breathTraining && breathPermissionError}
				<p class="breath-text warn">{breathPermissionError}</p>
			{/if}
		</div>
	</section>

	<section class="bubble-stage" bind:this={bubbleStageEl} on:wheel|preventDefault>
		<video
			bind:this={breathVideoEl}
			class="breath-video"
			class:preview={handCheckEnabled}
			autoplay
			playsinline
			muted
			width="640"
			height="480"
		></video>
		{#if breathTraining}
			{@const masterScale =
				(1.18 + breathMasterBubble.volume * 0.36) *
				breathingScale(breathExpectedPhase, breathExpectedProgress)}
			{@const masterOpacity = 0.52 + breathMasterBubble.volume * 0.42}
			<article class="master-bubble-shell" style={`--scale:${masterScale};--opacity:${masterOpacity};`}>
				<div class="bubble master-bubble" class:active={breathMasterBubble.isPlaying}>
					<span class={`master-phase-word phase-${breathExpectedPhase.toLowerCase()}`}>{breathExpectedPhase}</span>
					<span class="master-phase-time">{breathCountdown}s</span>
					<span
						class={`master-detect ${breathDetectedPhase === 'Calibrating' ? 'neutral' : breathCorrect ? 'ok' : 'warn'}`}
					>
						{breathDetectedPhase === 'Unknown'
							? 'Hand not detected'
							: breathDetectedPhase === 'Calibrating'
								? 'Calibrating hand...'
								: `Detected ${breathDetectedPhase}`}
					</span>
				</div>
				<h3>{breathMasterBubble.label}</h3>
				<p>{breathMasterBubble.namesText}</p>
			</article>
		{:else}
			{#each bubbles as bubble}
				{@const pulse = 1 + 0.1 * Math.sin(2 * Math.PI * bubble.pulseFrequency * clock)}
				{@const emergeRaw = Math.min(1, Math.max(0, (clock - (bubble.bornAt ?? 0)) / 0.95))}
				{@const emerge = easeOutCubic(emergeRaw)}
				{@const emergeScale = 0.72 + emerge * 0.28}
				{@const scale = (0.82 + bubble.volume * 0.5) * pulse * bubble.fusionScale * emergeScale}
				{@const opacity =
					(0.35 + bubble.volume * 0.65) * bubble.fusionOpacity * (0.25 + emerge * 0.75)}
				<article class="bubble-shell" style={`--scale:${scale};--opacity:${opacity};--emerge:${emerge};--drift:${bubble.drift}s;--floatState:${bubble.fusing ? 'paused' : 'running'};--diameter:${bubble.radius * 2}px;left:${bubble.x ?? 0}px;top:${bubble.y ?? 0}px;`}>
					<button
						class="bubble"
						class:active={bubble.active}
						class:fusing={bubble.fusing}
						on:pointerdown={(e) => startBubbleDrag(e, bubble)}
						on:dblclick|preventDefault={() => handleBubbleDoubleClick(bubble.uid)}
						on:wheel|preventDefault={(e) => adjustVolumeWithWheel(e, bubble.uid)}
						aria-pressed={bubble.active}
						aria-label={`${bubble.label}, ${Math.round(bubble.volume * 100)} percent volume`}
					></button>
					<h3>{bubble.label}</h3>
					<p>{Math.round(bubble.volume * 100)}%</p>
				</article>
			{/each}
		{/if}
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
			{#if mixes.length === 0}
				<p class="empty">No jars yet. Save your current mix.</p>
			{:else}
				<section class="cabinet-mixes">
					<h3>Saved Jars</h3>
					<div class="jar-grid">
						{#each mixes as jar}
							<div class="jar-wrap">
								<button
									class="jar"
									class:dragging={draggingMixId === jar.id}
									style={jarToneStyle()}
									on:pointerdown={(event) => startMixPointerDrag(event, jar.id)}
									on:pointerenter={() => hoverMixTarget(jar.id)}
									on:click={() => handleSavedJarClick(jar)}
								>
									<div class="lid"></div>
									<div class="liquid" style={jarLiquidStyle(jar.mix)}></div>
									<p>{jar.label}</p>
								</button>
								<button
									class="jar-delete"
									aria-label={`Delete ${jar.label}`}
									title="Delete jar"
									on:pointerdown|stopPropagation
									on:click|stopPropagation={() => removeMix(jar.id)}
								>
									×
								</button>
							</div>
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
		background: #071227;
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
		background:
			radial-gradient(circle at 16% 18%, rgba(142, 191, 255, 0.2), transparent 40%),
			radial-gradient(circle at 82% 84%, rgba(132, 171, 235, 0.16), transparent 44%),
			linear-gradient(155deg, #09172f 0%, var(--bgA) 46%, var(--bgB) 100%);
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

	.breath-panel {
		display: grid;
		justify-items: end;
		gap: 0.24rem;
	}

	.breath-actions {
		display: flex;
		gap: 0.35rem;
		align-items: flex-start;
	}

	.breath-btn {
		border: 1px solid rgba(197, 223, 255, 0.2);
		border-radius: 0.85rem;
		background: rgba(136, 182, 250, 0.08);
		color: var(--text);
		padding: 0.5rem 0.8rem;
		cursor: pointer;
		backdrop-filter: blur(16px) saturate(118%);
		pointer-events: auto;
	}

	.breath-btn.active {
		border-color: rgba(198, 235, 255, 0.46);
		background: rgba(148, 198, 255, 0.22);
	}

	.breath-text {
		margin: 0;
		font-size: 0.78rem;
		color: rgba(214, 233, 255, 0.92);
	}

	.breath-text.ok {
		color: rgba(188, 255, 215, 0.95);
	}

	.breath-text.warn {
		color: rgba(255, 206, 190, 0.95);
	}

	.save-box button,
	.clear,
	.drawer-toggle {
		border: 1px solid rgba(197, 223, 255, 0.2);
		border-radius: 0.85rem;
		background: rgba(136, 182, 250, 0.08);
		color: var(--text);
		padding: 0.5rem 0.8rem;
		cursor: pointer;
		backdrop-filter: blur(16px) saturate(118%);
	}

	.bubble-stage {
		grid-column: 1 / 2;
		position: relative;
		min-height: clamp(420px, 66vh, 760px);
		border-radius: 1.15rem;
		overflow: hidden;
		background:
			radial-gradient(circle at 22% 16%, rgba(153, 210, 255, 0.22), transparent 42%),
			radial-gradient(circle at 76% 86%, rgba(130, 179, 240, 0.18), transparent 40%),
			linear-gradient(170deg, rgba(129, 176, 236, 0.1), rgba(83, 123, 188, 0.07));
		border: 1px solid rgba(182, 214, 255, 0.2);
		backdrop-filter: blur(14px) saturate(120%);
	}

	.bubble-shell {
		position: absolute;
		transform: translate(-50%, -50%);
		display: grid;
		justify-items: center;
		gap: 0.4rem;
		animation: float 7s ease-in-out infinite;
		animation-delay: calc(var(--drift) * -1s);
		animation-play-state: var(--floatState);
	}

	.master-bubble-shell {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: grid;
		justify-items: center;
		gap: 0.45rem;
	}

	.master-bubble {
		--diameter: clamp(170px, 19vw, 236px);
		pointer-events: none;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 0.2rem;
	}

	.master-phase-word {
		font-size: clamp(1rem, 1.2vw, 1.22rem);
		font-weight: 700;
		letter-spacing: 0.02em;
		text-shadow: 0 1px 10px rgba(64, 104, 168, 0.35);
	}

	.master-phase-word.phase-inhale {
		color: rgba(177, 238, 255, 0.98);
	}

	.master-phase-word.phase-hold {
		color: rgba(255, 232, 182, 0.98);
	}

	.master-phase-word.phase-exhale {
		color: rgba(200, 255, 214, 0.98);
	}

	.master-phase-time {
		font-size: clamp(0.8rem, 1vw, 0.95rem);
		color: rgba(217, 235, 255, 0.9);
		padding: 0.1rem 0.42rem;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(214, 235, 255, 0.22);
		border-radius: 999px;
	}

	.master-detect {
		font-size: 0.72rem;
		padding: 0.08rem 0.45rem;
		border-radius: 999px;
		border: 1px solid rgba(214, 235, 255, 0.2);
	}

	.master-detect.ok {
		color: rgba(204, 255, 222, 0.98);
		background: rgba(93, 172, 126, 0.2);
		border-color: rgba(153, 233, 186, 0.42);
	}

	.master-detect.warn {
		color: rgba(255, 223, 206, 0.98);
		background: rgba(172, 101, 93, 0.2);
		border-color: rgba(239, 161, 145, 0.42);
	}

	.master-detect.neutral {
		color: rgba(220, 232, 255, 0.95);
		background: rgba(113, 142, 188, 0.2);
		border-color: rgba(183, 206, 241, 0.42);
	}

	.bubble {
		width: var(--diameter);
		height: var(--diameter);
		border: 1px solid rgba(201, 229, 255, 0.18);
		border-radius: 50%;
		background:
			radial-gradient(circle at 42% 38%, rgba(198, 225, 255, 0.32) 0%, rgba(145, 188, 244, 0.18) 36%, rgba(96, 139, 214, 0.12) 62%, rgba(66, 100, 164, 0.08) 100%),
			linear-gradient(155deg, rgba(177, 214, 255, 0.08), rgba(87, 125, 196, 0.14));
		color: #5a4f45;
		font-weight: 700;
		font-size: 1.1rem;
		opacity: var(--opacity);
		transform: scale(var(--scale)) translateZ(0);
		cursor: grab;
		position: relative;
		transition: transform 0.32s ease, opacity 0.32s ease, box-shadow 0.28s ease, filter 0.35s ease;
		touch-action: none;
		user-select: none;
		isolation: isolate;
		backdrop-filter: blur(10px) saturate(116%);
		box-shadow:
			inset -10px -12px 18px rgba(89, 137, 217, 0.12),
			inset 8px 10px 16px rgba(211, 233, 255, 0.2),
			0 8px 24px rgba(35, 66, 124, 0.2);
		filter: blur(calc((1 - var(--emerge)) * 2.2px));
	}

	.bubble::before,
	.bubble::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		border-radius: 50%;
		pointer-events: none;
	}

	.bubble::before {
		width: 56%;
		height: 42%;
		left: 33%;
		top: 31%;
		transform: translate(-50%, -50%) rotate(-21deg);
		background: radial-gradient(circle, rgba(233, 245, 255, 0.44) 0%, rgba(210, 233, 255, 0.14) 46%, transparent 75%);
		filter: blur(calc(1px + (1 - var(--emerge)) * 1.6px));
		opacity: calc(0.25 + var(--emerge) * 0.75);
	}

	.bubble::after {
		width: 114%;
		height: 114%;
		transform: translate(-50%, -50%) scale(1);
		background: radial-gradient(circle, rgba(159, 206, 255, 0.26) 0%, rgba(128, 180, 243, 0.14) 42%, transparent 74%);
		opacity: calc(0.12 + var(--emerge) * 0.3);
		filter: blur(calc(2px + (1 - var(--emerge)) * 3px));
		z-index: -1;
	}

	.bubble:active {
		cursor: grabbing;
	}

	.bubble.fusing {
		pointer-events: none;
	}

	.bubble.active {
		box-shadow:
			inset -10px -12px 18px rgba(94, 148, 228, 0.18),
			inset 8px 10px 16px rgba(226, 242, 255, 0.24),
			0 0 18px rgba(128, 181, 246, 0.42),
			0 0 42px rgba(108, 165, 235, 0.28);
		animation: aura 3.4s ease-in-out infinite;
		filter: saturate(1.08);
	}

	.bubble.active::after {
		animation: aura-size 3.4s ease-in-out infinite;
	}

	@keyframes aura {
		0%,
		100% {
			box-shadow:
				inset -10px -12px 18px rgba(100, 150, 228, 0.14),
				inset 8px 10px 16px rgba(226, 242, 255, 0.2),
				0 0 16px rgba(142, 194, 255, 0.36),
				0 0 34px rgba(116, 174, 243, 0.24);
		}
		50% {
			box-shadow:
				inset -10px -12px 20px rgba(108, 161, 238, 0.2),
				inset 8px 10px 18px rgba(231, 245, 255, 0.28),
				0 0 26px rgba(166, 209, 255, 0.46),
				0 0 52px rgba(130, 187, 255, 0.3);
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
		background: rgba(255, 255, 255, 0.12);
		border-radius: 999px;
	}

	.master-bubble-shell h3 {
		font-size: 0.93rem;
		color: rgba(216, 233, 255, 0.94);
	}

	.master-bubble-shell p {
		margin: 0;
		font-size: 0.78rem;
		color: rgba(199, 221, 251, 0.92);
		padding: 0.14rem 0.52rem;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 999px;
	}

	.bubble-hint {
		position: absolute;
		left: 0.9rem;
		bottom: 0.7rem;
		margin: 0;
		font-size: 0.8rem;
		color: rgba(195, 219, 248, 0.82);
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
		background: rgba(147, 191, 255, 0.12);
		border: 1px solid rgba(191, 221, 255, 0.22);
		border-radius: 0.7rem;
		padding: 0.38rem 0.62rem;
		color: var(--text);
		backdrop-filter: blur(14px);
	}

	.drawer {
		grid-column: 2 / 3;
		grid-row: 1 / -1;
		align-self: stretch;
		position: relative;
		width: min(300px, 78vw);
		height: 100%;
		background: rgba(122, 173, 243, 0.09);
		border: 1px solid rgba(190, 221, 255, 0.2);
		border-radius: 1rem;
		overflow: hidden;
		transition: width 0.25s ease;
		backdrop-filter: blur(18px) saturate(118%);
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
		color: rgba(192, 220, 255, 0.84);
		transition: transform 0.18s ease, color 0.18s ease, opacity 0.18s ease;
		opacity: 0.72;
	}

	.drawer-toggle:hover {
		opacity: 1;
		color: rgba(224, 239, 255, 0.98);
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

	.cabinet-mixes h3 {
		font-size: 0.9rem;
		color: #cde2ff;
	}

	.cabinet-mixes {
		margin-top: 0.7rem;
	}

	.empty {
		color: rgba(199, 220, 248, 0.8);
		font-size: 0.9rem;
		margin-top: 1rem;
	}

	.jar-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(92px, 1fr));
		gap: 0.75rem;
		margin-top: 0.8rem;
	}

	.jar-wrap {
		position: relative;
	}

	.jar {
		width: 100%;
		border: 1px solid rgba(194, 223, 255, 0.22);
		border-radius: 1rem;
		padding: 0.6rem 0.5rem;
		background: rgba(141, 188, 247, 0.12);
		cursor: grab;
		color: #d8e9ff;
		user-select: none;
		backdrop-filter: blur(14px) saturate(116%);
	}

	.jar:active {
		cursor: grabbing;
	}

	.jar.dragging {
		opacity: 0.56;
		transform: scale(0.97);
	}

	.jar-delete {
		position: absolute;
		top: 0.28rem;
		right: 0.3rem;
		width: 1.2rem;
		height: 1.2rem;
		border: 1px solid rgba(197, 223, 255, 0.25);
		border-radius: 999px;
		background: rgba(26, 45, 78, 0.52);
		color: rgba(228, 239, 255, 0.92);
		font-size: 0.92rem;
		line-height: 1;
		padding: 0;
		cursor: pointer;
		backdrop-filter: blur(8px);
	}

	.jar-delete:hover {
		background: rgba(43, 71, 116, 0.72);
	}

	.lid {
		width: 56%;
		height: 9px;
		margin: 0 auto;
		background: linear-gradient(180deg, var(--lid-b, #5f8dce), var(--lid-a, #3f659f));
		border-radius: 0.4rem;
	}

	.liquid {
		position: relative;
		height: 64px;
		margin: 0.2rem auto 0.4rem;
		width: 72%;
		border-radius: 0.85rem;
		border: 1px solid rgba(194, 223, 255, 0.2);
		background: linear-gradient(
			180deg,
			rgba(220, 238, 255, 0.14) 0%,
			color-mix(in srgb, var(--jar, #9dccff) 20%, transparent 80%) calc(100% - var(--fill)),
			color-mix(in srgb, var(--jar-glow, #72a4df) 30%, transparent 70%) 100%
		);
		box-shadow: inset 0 0 14px rgba(169, 203, 245, 0.22);
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

	.breath-video {
		display: none;
	}

	.breath-video.preview {
		display: block;
		position: absolute;
		right: 0.75rem;
		top: 0.75rem;
		width: 190px;
		height: 142px;
		opacity: 0.9;
		box-shadow: 0 8px 22px rgba(12, 27, 54, 0.36);
		background: rgba(24, 52, 96, 0.22);
		backdrop-filter: blur(10px);
		border-radius: 0.75rem;
		border: 1px solid rgba(195, 223, 255, 0.28);
		object-fit: cover;
		transform: scaleX(-1);
		z-index: 14;
	}
</style>
