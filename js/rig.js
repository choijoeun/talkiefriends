/* ==========================================================================
   TalkieFriends v3 — Nano Banana Articulated Image-Rig Engine (TFRig)
   - Renders genuine Nano Banana transparent sprite parts on real 2D joints:
     Tail (wag) -> Far Right Arm (wave/cheer/salute) -> Body (breathe)
     -> Front Left Arm (swing/cheer) -> Head (nod/tilt + idle/talk lip-sync!)
     -> Optional Swappable Accessory
   - Supports Exploded Rig Inspection View, Per-Part Mix & Match,
     Canvas Exterior White Flood-Fill Transparency, and 1-Photo Auto-Split!
   ========================================================================== */

window.TFRig = (function () {
  function scaleAround(scale, cx, cy) {
    const s = scale ?? 1;
    if (Math.abs(s - 1) < 0.001) return '';
    return `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;
  }

  function resolveUrl(path) {
    if (!path) return '';
    if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http')) return path;
    return window.TFData.assetUrl(path);
  }

  function renderAccessory(acc) {
    switch (acc) {
      case 'crown':
        return `<g transform="translate(132 18) rotate(-5)">
          <path d="M-22 18 L-16 -4 L0 8 L16 -4 L22 18 Z" fill="#FFD15C" stroke="#B45309" stroke-width="2.6" stroke-linejoin="round"/>
          <circle cx="0" cy="11" r="4.2" fill="#FF6B9A"/>
        </g>`;
      case 'ribbon':
        return `<g transform="translate(154 34) rotate(14)">
          <ellipse cx="-11" cy="0" rx="12" ry="7.5" fill="#FF6B9A" stroke="#BE185D" stroke-width="2.2"/>
          <ellipse cx="11" cy="0" rx="12" ry="7.5" fill="#FF6B9A" stroke="#BE185D" stroke-width="2.2"/>
          <circle cx="0" cy="0" r="5.5" fill="#FFD1E3" stroke="#BE185D" stroke-width="2.2"/>
        </g>`;
      case 'chef_hat':
        return `<g transform="translate(132 22)">
          <circle cx="-18" cy="-8" r="14" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2.4"/>
          <circle cx="0" cy="-14" r="17" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2.4"/>
          <circle cx="18" cy="-8" r="14" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2.4"/>
          <rect x="-24" y="-4" width="48" height="16" rx="6" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2.4"/>
        </g>`;
      case 'safari_hat':
        return `<g transform="translate(132 26)">
          <ellipse cx="0" cy="6" rx="46" ry="11" fill="#D4A373" stroke="#784B27" stroke-width="2.5"/>
          <path d="M-28 4 C-26 -20, 26 -20, 28 4 Z" fill="#E6BE94" stroke="#784B27" stroke-width="2.5"/>
          <rect x="-28" y="-2" width="56" height="7" rx="3" fill="#784B27"/>
        </g>`;
      case 'glasses':
        return `<g stroke="#1E293B" stroke-width="3.2" fill="rgba(255,255,255,0.22)">
          <circle cx="122" cy="96" r="16"/>
          <circle cx="160" cy="96" r="15"/>
          <line x1="138" y1="96" x2="145" y2="96"/>
        </g>`;
      default:
        return '';
    }
  }

  function renderJointPins(exploded, boxes) {
    if (!exploded) return '';
    return `
      <g class="rig-joints-overlay" font-size="11" font-weight="800" font-family="sans-serif">
        <circle cx="${boxes.head.px}" cy="${boxes.head.py}" r="5.5" fill="#06B6D4" stroke="#FFF" stroke-width="2"/>
        <text x="${boxes.head.px + 9}" y="${boxes.head.py + 4}" fill="#0E7490" stroke="#FFF" stroke-width="3" paint-order="stroke">목 관절(Head)</text>
        <circle cx="${boxes.armL.px}" cy="${boxes.armL.py}" r="5.5" fill="#F43F5E" stroke="#FFF" stroke-width="2"/>
        <text x="4" y="${boxes.armL.py - 8}" fill="#BE123C" stroke="#FFF" stroke-width="3" paint-order="stroke">왼손 관절</text>
        <circle cx="${boxes.armR.px}" cy="${boxes.armR.py}" r="5.5" fill="#F43F5E" stroke="#FFF" stroke-width="2"/>
        <text x="172" y="${boxes.armR.py - 18}" fill="#BE123C" stroke="#FFF" stroke-width="3" paint-order="stroke">오른손 관절</text>
        <circle cx="${boxes.tail.px}" cy="${boxes.tail.py}" r="5.5" fill="#8B5CF6" stroke="#FFF" stroke-width="2"/>
        <text x="4" y="${boxes.tail.py + 34}" fill="#6D28D9" stroke="#FFF" stroke-width="3" paint-order="stroke">꼬리 관절</text>
      </g>`;
  }

  /**
   * Render full articulated Nano Banana sprite puppet SVG!
   */
  function renderPuppetSVG(character, options = {}) {
    const rig = character.rig || {};
    const presets = window.TFData.RIG_PRESETS;
    const hp = presets[rig.headPreset] || presets.bluey;
    const bp = presets[rig.bodyPreset] || presets.bluey;
    const lp = presets[rig.leftHandPreset] || presets.bluey;
    const rp = presets[rig.rightHandPreset] || presets.bluey;
    const tp = presets[rig.tailPreset] || presets.bluey;

    const custom = rig.customParts || {};
    const adj = rig.partAdjust || {};

    const headIdleUrl = resolveUrl(custom.head || hp.headIdle);
    const headTalkUrl = resolveUrl(custom.headTalk || custom.head || hp.headTalk);
    const bodyUrl = resolveUrl(custom.body || bp.body);
    const armLUrl = resolveUrl(custom.leftHand || lp.armL);
    const armRUrl = resolveUrl(custom.rightHand || rp.armR);
    const tailUrl = resolveUrl(custom.backProp || tp.tail);

    const hb = hp.box.head;
    const bb = bp.box.body;
    const lb = lp.box.armL;
    const rb = rp.box.armR;
    const tb = tp.box.tail;

    const animState = options.animState || 'idle';
    const exploded = Boolean(options.exploded);
    const idleClass = window.TFData.PERSONALITY_PROFILES[character.personality]?.idleAnim || 'idle-bouncy';

    return `
      <svg class="puppet-svg state-${animState} ${idleClass} ${exploded ? 'exploded' : ''}" viewBox="0 0 260 320" aria-label="${character.nameKr} 리깅 캐릭터">
        <ellipse class="puppet-shadow" cx="132" cy="292" rx="64" ry="12" fill="rgba(35,28,22,0.22)" />
        <g class="rig-root">
          <!-- 1. Tail / Back Prop (pivots at tail root) -->
          <g class="rig-back-prop" style="transform-origin: ${tb.px}px ${tb.py}px;">
            <g transform="${scaleAround(adj.backProp?.scale, tb.px, tb.py)}">
              <image href="${tailUrl}" x="${tb.x}" y="${tb.y}" width="${tb.w}" height="${tb.h}" preserveAspectRatio="xMidYMid meet" />
            </g>
          </g>

          <!-- 2. Far Right Waving Arm (behind body, pivots at right shoulder) -->
          <g class="rig-arm-right" style="transform-origin: ${rb.px}px ${rb.py}px;">
            <g transform="${scaleAround(adj.rightHand?.scale, rb.px, rb.py)}">
              <image href="${armRUrl}" x="${rb.x}" y="${rb.y}" width="${rb.w}" height="${rb.h}" preserveAspectRatio="xMidYMid meet" />
            </g>
          </g>

          <!-- 3. Torso & Standing Legs (breathes gently) -->
          <g class="rig-body" style="transform-origin: ${bb.px}px ${bb.py}px;">
            <g transform="${scaleAround(adj.body?.scale, bb.px, bb.py)}">
              <image href="${bodyUrl}" x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" preserveAspectRatio="xMidYMid meet" />
            </g>
          </g>

          <!-- 4. Front Left Arm & Paw (in front of body, pivots at left shoulder) -->
          <g class="rig-arm-left" style="transform-origin: ${lb.px}px ${lb.py}px;">
            <g transform="${scaleAround(adj.leftHand?.scale, lb.px, lb.py)}">
              <image href="${armLUrl}" x="${lb.x}" y="${lb.y}" width="${lb.w}" height="${lb.h}" preserveAspectRatio="xMidYMid meet" />
            </g>
          </g>

          <!-- 5. Head (pivots at neck + alternates idle/talk Nano Banana sprites for real lip-sync!) -->
          <g class="rig-head" style="transform-origin: ${hb.px}px ${hb.py}px;">
            <g transform="${scaleAround(adj.head?.scale, hb.px, hb.py)}">
              <image class="rig-head-idle" href="${headIdleUrl}" x="${hb.x}" y="${hb.y}" width="${hb.w}" height="${hb.h}" preserveAspectRatio="xMidYMid meet" />
              <image class="rig-head-talk" href="${headTalkUrl}" x="${hb.x}" y="${hb.y}" width="${hb.w}" height="${hb.h}" preserveAspectRatio="xMidYMid meet" />
              ${renderAccessory(rig.accessory)}
            </g>
          </g>

          ${renderJointPins(exploded, { head: hb, armL: lb, armR: rb, tail: tb })}
        </g>
      </svg>`;
  }

  /**
   * Smart Exterior Border Flood-Fill White Background Remover (Preserves interior white eyes/teeth!)
   */
  function processImageFile(file, { removeWhiteBg = true, threshold = 232 } = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const maxDim = 420;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          if (removeWhiteBg) {
            const imgData = ctx.getImageData(0, 0, w, h);
            const d = imgData.data;
            const visited = new Uint8Array(w * h);
            const queue = [];

            const isNearWhite = (idx) => {
              const o = idx * 4;
              const r = d[o], g = d[o + 1], b = d[o + 2];
              return r >= threshold && g >= threshold && b >= threshold && Math.abs(r - g) < 18 && Math.abs(g - b) < 18;
            };

            const push = (x, y) => {
              const idx = y * w + x;
              if (!visited[idx] && isNearWhite(idx)) {
                visited[idx] = 1;
                queue.push(idx);
              }
            };

            for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
            for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

            let head = 0;
            while (head < queue.length) {
              const idx = queue[head++];
              d[idx * 4 + 3] = 0;
              const x = idx % w;
              const y = (idx - x) / w;
              if (x > 0) push(x - 1, y);
              if (x + 1 < w) push(x + 1, y);
              if (y > 0) push(x, y - 1);
              if (y + 1 < h) push(x, y + 1);
            }
            ctx.putImageData(imgData, 0, 0);
          }

          resolve({ dataUrl: canvas.toDataURL('image/png'), width: w, height: h, canvas });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * 1-Photo Auto-Split Rig: Splits any single uploaded character into animated Head + Body!
   */
  async function autoSplitSinglePhoto(file, { splitRatio = 0.48, removeWhiteBg = true } = {}) {
    const { canvas, width, height } = await processImageFile(file, { removeWhiteBg });
    const splitY = Math.max(20, Math.min(height - 20, Math.round(height * splitRatio)));

    const headCanvas = document.createElement('canvas');
    headCanvas.width = width;
    headCanvas.height = splitY;
    headCanvas.getContext('2d').drawImage(canvas, 0, 0, width, splitY, 0, 0, width, splitY);

    const bodyCanvas = document.createElement('canvas');
    bodyCanvas.width = width;
    bodyCanvas.height = height - splitY;
    bodyCanvas.getContext('2d').drawImage(canvas, 0, splitY, width, height - splitY, 0, 0, width, height - splitY);

    return {
      headUrl: headCanvas.toDataURL('image/png'),
      bodyUrl: bodyCanvas.toDataURL('image/png')
    };
  }

  return {
    renderPuppetSVG,
    processImageFile,
    autoSplitSinglePhoto
  };
})();
