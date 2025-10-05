import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'

/**
 * Custom hook to synchronize cameras between two Cesium viewers
 * @param {boolean} isEnabled - Whether synchronization is enabled
 * @param {Object} viewerRef1 - Ref to the first Cesium Viewer
 * @param {Object} viewerRef2 - Ref to the second Cesium Viewer
 */
export function useSplitViewSync(isEnabled, viewerRef1, viewerRef2) {
  const lastInteractedViewer = useRef('viewer1')
  const isSyncing = useRef(false)

  useEffect(() => {
    if (!isEnabled) return

    const checkViewers = () => {
      const viewer1 = viewerRef1.current?.cesiumElement
      const viewer2 = viewerRef2.current?.cesiumElement
      if (!viewer1 || !viewer2) {
        requestAnimationFrame(checkViewers)
        return
      }

      const canvas1 = viewer1.scene.canvas
      const canvas2 = viewer2.scene.canvas

      // Track which viewer is being interacted with
      const markViewer1 = () => { lastInteractedViewer.current = 'viewer1' }
      const markViewer2 = () => { lastInteractedViewer.current = 'viewer2' }

      canvas1.addEventListener('mousedown', markViewer1, true)
      canvas1.addEventListener('wheel', markViewer1, { passive: true, capture: true })
      canvas1.addEventListener('touchstart', markViewer1, true)
      canvas2.addEventListener('mousedown', markViewer2, true)
      canvas2.addEventListener('wheel', markViewer2, { passive: true, capture: true })
      canvas2.addEventListener('touchstart', markViewer2, true)

      // Continuous sync on every frame
      const syncCameras = () => {
        if (isSyncing.current) return
        isSyncing.current = true

        const source = lastInteractedViewer.current === 'viewer2' ? viewer2 : viewer1
        const target = lastInteractedViewer.current === 'viewer2' ? viewer1 : viewer2

        // Copy camera state
        Cesium.Cartesian3.clone(source.camera.position, target.camera.position)
        Cesium.Cartesian3.clone(source.camera.direction, target.camera.direction)
        Cesium.Cartesian3.clone(source.camera.up, target.camera.up)
        Cesium.Cartesian3.clone(source.camera.right, target.camera.right)

        isSyncing.current = false
      }

      viewer1.scene.preRender.addEventListener(syncCameras)
      viewer2.scene.preRender.addEventListener(syncCameras)

      // Initial sync
      syncCameras()

      // Cleanup
      return () => {
        canvas1.removeEventListener('mousedown', markViewer1, true)
        canvas1.removeEventListener('wheel', markViewer1, true)
        canvas1.removeEventListener('touchstart', markViewer1, true)
        canvas2.removeEventListener('mousedown', markViewer2, true)
        canvas2.removeEventListener('wheel', markViewer2, true)
        canvas2.removeEventListener('touchstart', markViewer2, true)

        viewer1.scene.preRender.removeEventListener(syncCameras)
        viewer2.scene.preRender.removeEventListener(syncCameras)
      }
    }

    return checkViewers()
  }, [isEnabled, viewerRef1, viewerRef2])
}
