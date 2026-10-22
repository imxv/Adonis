import { Color, Vector4 } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { GreekWorldQuality } from '../types';
import type { ReferenceOffscreenPass, ReferenceRenderFrame } from './contracts';

export interface ReferenceFrameInput {
  readonly camera: Camera;
  readonly time: number;
  readonly delta: number;
  readonly quality: GreekWorldQuality;
  readonly viewport: ReferenceRenderFrame['viewport'];
  readonly beforeRender?: (frame: ReferenceRenderFrame) => void;
}
export interface ReferenceFrameCost {
  readonly calls: number;
  readonly triangles: number;
  readonly offscreenPasses: number;
  readonly offscreenPixels: number;
}

/** D-only render boundary: all water surfaces share this single budget/recursion guard. */
export function createReferenceRenderContext(renderer: WebGLRenderer, scene: Scene) {
  const originalAutoReset = renderer.info.autoReset;
  renderer.info.autoReset = false;
  let disposed = false, active = false, inOffscreen = false, frameNumber = 0;
  let usedPasses = 0, usedPixels = 0;
  let budget = { maxPasses: 0, maxTargetSize: 0 };

  const renderOffscreen = (pass: ReferenceOffscreenPass): boolean => {
    if (disposed || !active || inOffscreen || usedPasses >= budget.maxPasses) return false;
    const { target } = pass;
    if (!Number.isFinite(target.width) || !Number.isFinite(target.height)
      || target.width < 1 || target.height < 1
      || Math.max(target.width, target.height) > budget.maxTargetSize) return false;
    if (target === renderer.getRenderTarget()) return false;
    const captureViewport = target.viewport.clone(), captureScissorTest = target.scissorTest;
    const previous = {
      target: renderer.getRenderTarget(), cubeFace: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new Vector4()), scissor: renderer.getScissor(new Vector4()), scissorTest: renderer.getScissorTest(),
      clipping: renderer.clippingPlanes, localClipping: renderer.localClippingEnabled,
      xr: renderer.xr.enabled, autoClear: renderer.autoClear,
      clearColor: renderer.getClearColor(new Color()), clearAlpha: renderer.getClearAlpha(),
      shadowAuto: renderer.shadowMap.autoUpdate, shadowNeedsUpdate: renderer.shadowMap.needsUpdate,
      overrideMaterial: scene.overrideMaterial,
    };
    const visibility = [...new Set(pass.exclude)].map(object => ({ object, visible: object.visible }));
    inOffscreen = true;
    // Reserve before rendering so a render callback cannot re-enter and spend the same slot.
    usedPasses++;
    usedPixels += target.width * target.height;
    try {
      visibility.forEach(({ object }) => { object.visible = false; });
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.autoClear = true;
      if (pass.clippingPlane) {
        renderer.clippingPlanes = [pass.clippingPlane.clone()];
        renderer.localClippingEnabled = true;
      }
      // setViewport() uses the canvas DPR even for RTs in Three. Target.viewport is
      // already physical pixels; setRenderTarget applies it without another DPR scale.
      target.viewport.set(0, 0, target.width, target.height);
      target.scissorTest = false;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, pass.camera);
      return true;
    } finally {
      // Restore caller state even when a shader, material hook or capture render throws.
      scene.overrideMaterial = previous.overrideMaterial;
      visibility.forEach(({ object, visible }) => { object.visible = visible; });
      renderer.clippingPlanes = previous.clipping;
      renderer.localClippingEnabled = previous.localClipping;
      renderer.xr.enabled = previous.xr;
      renderer.autoClear = previous.autoClear;
      renderer.setClearColor(previous.clearColor, previous.clearAlpha);
      renderer.shadowMap.autoUpdate = previous.shadowAuto;
      renderer.shadowMap.needsUpdate = previous.shadowNeedsUpdate;
      target.viewport.copy(captureViewport); target.scissorTest = captureScissorTest;
      renderer.setViewport(previous.viewport);
      renderer.setScissor(previous.scissor);
      renderer.setScissorTest(previous.scissorTest);
      renderer.setRenderTarget(previous.target, previous.cubeFace, previous.mip);
      inOffscreen = false;
    }
  };

  return {
    render(input: ReferenceFrameInput): ReferenceFrameCost {
      if (disposed) return { calls: 0, triangles: 0, offscreenPasses: 0, offscreenPixels: 0 };
      if (active) throw new Error('Reference main render must not recurse');
      // This boundary serves the direct-to-canvas world, not a nested compositor.
      // Reject pre-existing RTs rather than lose an RT-specific physical viewport/scissor.
      if (renderer.getRenderTarget() !== null) throw new Error('Reference main render requires the canvas render target');
      budget = input.quality === 'low' ? { maxPasses: 0, maxTargetSize: 0 }
        : input.quality === 'medium' ? { maxPasses: 1, maxTargetSize: 512 } : { maxPasses: 2, maxTargetSize: 1024 };
      usedPasses = usedPixels = 0;
      renderer.info.reset();
      active = true;
      const token = ++frameNumber;
      try {
        scene.updateMatrixWorld(true);
        input.camera.updateMatrixWorld(true);
        input.beforeRender?.({
          frameNumber: token, time: input.time, delta: input.delta,
          renderer, scene, camera: input.camera, viewport: input.viewport, offscreenBudget: { ...budget },
          renderOffscreen: pass => active && frameNumber === token ? renderOffscreen(pass) : false,
        });
        renderer.render(scene, input.camera);
        return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, offscreenPasses: usedPasses, offscreenPixels: usedPixels };
      } finally { active = false; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.info.autoReset = originalAutoReset;
    },
  };
}
