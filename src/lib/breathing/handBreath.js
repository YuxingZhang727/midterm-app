const DEFAULTS = {
	ySmoothing: 0.22,
	vSmoothing: 0.3,
	minSwitchMs: 260,
	calibrationMs: 1500,
	inhaleThreshold: 0.02,
	exhaleThreshold: 0.008,
	holdBand: 0.005,
	historySize: 6
};

function pickPoint(points, names, fallbackIndex) {
	const named = points.find((p) => names.includes(p?.name ?? p?.part));
	return named ?? points[fallbackIndex] ?? null;
}

function pickHandY(hand) {
	const points = hand?.keypoints ?? [];
	const wrist = pickPoint(points, ['wrist'], 0);
	const midMcp = pickPoint(points, ['middle_finger_mcp', 'middle_finger_pip'], 9);
	if (!wrist || wrist.y == null) return null;
	if (!midMcp || midMcp.y == null) return wrist.y;
	// Blending two landmarks gives a steadier vertical signal than wrist alone.
	return wrist.y * 0.62 + midMcp.y * 0.38;
}

function avg(values) {
	if (!values.length) return 0;
	let sum = 0;
	for (const value of values) sum += value;
	return sum / values.length;
}

export class FaceMeshBreathMonitor {
	constructor(options = {}) {
		this.opts = { ...DEFAULTS, ...options };
		this.model = null;
		this.running = false;
		this.onUpdate = null;
		this.lastPhase = 'Unknown';
		this.lastSwitchAt = 0;
		this.calibrating = true;
		this.calibrationStartedAt = 0;

		this.smoothedY = 0;
		this.prevY = 0;
		this.smoothedVel = 0;
		this.velocityHistory = [];
		this.lastTs = 0;
	}

	async start(videoEl, onUpdate) {
		if (this.running) return;
		this.onUpdate = onUpdate;
		this.lastPhase = 'Unknown';
		this.lastSwitchAt = 0;
		this.calibrating = true;
		this.calibrationStartedAt = performance.now();
		this.smoothedY = 0;
		this.prevY = 0;
		this.smoothedVel = 0;
		this.velocityHistory = [];
		this.lastTs = 0;

		const ml5Module = await import('ml5');
		const ml5 = ml5Module.default ?? ml5Module;
		// Match the official example flow: create model first, wait ready, then detectStart.
		this.model = ml5.handPose();
		await this.model.ready;
		this.model.detectStart(videoEl, (hands) => this.handleHands(hands, videoEl));
		this.running = true;
	}

	stop() {
		if (!this.running) return;
		this.model?.detectStop();
		this.running = false;
		this.calibrating = true;
	}

	handleHands(hands, videoEl) {
		const hand = Array.isArray(hands) ? hands[0] : null;
		const wristY = pickHandY(hand);
		if (wristY == null) {
			this.velocityHistory = [];
			this.emit('Unknown', this.smoothedVel, 0, 0, this.calibrating, false);
			return;
		}

		const now = performance.now();
		const videoHeight = Math.max(1, videoEl?.videoHeight ?? videoEl?.height ?? 1);
		const yNorm = wristY / videoHeight;

		this.smoothedY =
			this.smoothedY === 0
				? yNorm
				: this.smoothedY * (1 - this.opts.ySmoothing) + yNorm * this.opts.ySmoothing;

		let velocity = 0;
		if (this.lastTs > 0) {
			const dtSec = Math.max(0.001, (now - this.lastTs) / 1000);
			velocity = (this.smoothedY - this.prevY) / dtSec;
		}
		this.lastTs = now;
		this.prevY = this.smoothedY;
		this.smoothedVel =
			this.smoothedVel === 0
				? velocity
				: this.smoothedVel * (1 - this.opts.vSmoothing) + velocity * this.opts.vSmoothing;
		this.velocityHistory.push(this.smoothedVel);
		if (this.velocityHistory.length > this.opts.historySize) this.velocityHistory.shift();
		const trendVel = avg(this.velocityHistory);

		if (this.calibrating) {
			if (now - this.calibrationStartedAt >= this.opts.calibrationMs) {
				this.calibrating = false;
				this.lastPhase = 'Inhale';
				this.lastSwitchAt = now;
			} else {
				this.emit('Calibrating', this.smoothedVel, velocity, 0, true, true);
				return;
			}
		}

		let nextPhase = this.lastPhase;
		if (trendVel < -this.opts.inhaleThreshold) {
			nextPhase = 'Inhale';
		} else if (trendVel > this.opts.exhaleThreshold) {
			nextPhase = 'Exhale';
		} else if (
			Math.abs(trendVel) <= this.opts.holdBand &&
			Math.abs(this.smoothedVel) <= this.opts.holdBand * 1.4
		) {
			// Only enter Hold near true standstill; keep directional intent otherwise.
			nextPhase = 'Hold';
		} else if (this.lastPhase === 'Exhale' && trendVel > -this.opts.holdBand) {
			nextPhase = 'Exhale';
		} else if (this.lastPhase === 'Inhale' && trendVel < this.opts.holdBand) {
			nextPhase = 'Inhale';
		}

		if (nextPhase !== this.lastPhase && now - this.lastSwitchAt >= this.opts.minSwitchMs) {
			this.lastPhase = nextPhase;
			this.lastSwitchAt = now;
		}

		this.emit(this.lastPhase, trendVel, velocity, 0, false, true);
	}

	emit(phase, smoothedSignal, rawSignal, baseline, calibrating, handVisible) {
		this.onUpdate?.({
			phase,
			smoothedOpenness: smoothedSignal,
			rawOpenness: rawSignal,
			baseline,
			calibrating,
			handVisible
		});
	}
}
