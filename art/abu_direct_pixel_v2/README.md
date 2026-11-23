Abu Stage 0 Direct Pixel Correction Working v2

Working attempt only; not merge-ready. Source RGB colors are preserved through nearest-neighbor geometry transforms. Alpha thresholded to binary. Pose geometry is altered by whole-sprite affine transform, not detailed limb redraw; this does NOT satisfy Claude’s requested localized 3-region redraw/silhouette threshold yet. Effects are drawn as block pixel clusters. See QA_WORKING_REPORT.json.
