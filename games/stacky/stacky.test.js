describe('Wobble Recovery', () => {
  test('should reduce wobble after clean placements', () => {
    const recentPlacements = [
      {x: 3, y: 10},
      {x: 4, y: 11},
      {x: 5, y: 12}
    ];
    const wobble = applyWobbleRecovery(null, recentPlacements);
    expect(wobble).toBeLessThan(0.5);
  });

  test('should increase wobble after boundary violations', () => {
    const recentPlacements = [
      {x: -1, y: 10},
      {x: 20, y: 11}
    ];
    const wobble = applyWobbleRecovery(null, recentPlacements);
    expect(wobble).toBe(0.4);
  });
});