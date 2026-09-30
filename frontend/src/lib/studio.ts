export const DIMENSIONS = ['modernity', 'professionalism', 'accessibility', 'visual_hierarchy', 'mobile_ux', 'trustworthiness', 'conversion_readiness']

/** Mean of the 0-10 quality scores, one decimal. */
export const avg = (scores: Record<string, number>) => {
  const v = DIMENSIONS.map((d) => scores[d]).filter((x) => x != null)
  return v.length ? Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10 : null
}
