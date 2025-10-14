/**
 * Jest tests for FIFO (First-In-First-Out) position matching
 * 
 * Run with: npm test
 * or: npx jest tests/fifo.test.js
 */

const { computePositions, getCurrentOpenQuantity } = require('../utils/fifo');

describe('FIFO Position Matching', () => {
  
  describe('computePositions', () => {
    
    test('should handle simple buy and hold', () => {
      const transactions = [
        {
          isin: 'TEST001',
          company: 'Test Company',
          type: 'BUY',
          share_count: 100,
          price: 50,
          trade_date: new Date('2023-01-01'),
        },
      ];

      const result = computePositions(transactions);
      
      expect(result.openLotsByIsin['TEST001']).toHaveLength(1);
      expect(result.openLotsByIsin['TEST001'][0].quantity).toBe(100);
      expect(result.openLotsByIsin['TEST001'][0].price).toBe(50);
      expect(result.realizedByIsin['TEST001']).toHaveLength(0);
    });

    test('should handle complete sell of single lot', () => {
      const transactions = [
        {
          isin: 'TEST001',
          company: 'Test Company',
          type: 'BUY',
          share_count: 100,
          price: 50,
          trade_date: new Date('2023-01-01'),
        },
        {
          isin: 'TEST001',
          company: 'Test Company',
          type: 'SELL',
          share_count: 100,
          price: 70,
          trade_date: new Date('2023-06-01'),
        },
      ];

      const result = computePositions(transactions);
      
      expect(result.openLotsByIsin['TEST001']).toHaveLength(0);
      expect(result.realizedByIsin['TEST001']).toHaveLength(1);
      
      const realized = result.realizedByIsin['TEST001'][0];
      expect(realized.quantity).toBe(100);
      expect(realized.buy_price).toBe(50);
      expect(realized.sell_price).toBe(70);
      expect(realized.purchase_date).toEqual(new Date('2023-01-01'));
      expect(realized.sell_date).toEqual(new Date('2023-06-01'));
    });

    test('should handle partial sell from single lot', () => {
      const transactions = [
        {
          isin: 'TEST001',
          company: 'Test Company',
          type: 'BUY',
          share_count: 100,
          price: 50,
          trade_date: new Date('2023-01-01'),
        },
        {
          isin: 'TEST001',
          company: 'Test Company',
          type: 'SELL',
          share_count: 40,
          price: 70,
          trade_date: new Date('2023-06-01'),
        },
      ];

      const result = computePositions(transactions);
      
      // Should have 60 shares remaining
      expect(result.openLotsByIsin['TEST001']).toHaveLength(1);
      expect(result.openLotsByIsin['TEST001'][0].quantity).toBe(60);
      expect(result.openLotsByIsin['TEST001'][0].price).toBe(50);
      
      // Should have 40 shares sold
      expect(result.realizedByIsin['TEST001']).toHaveLength(1);
      expect(result.realizedByIsin['TEST001'][0].quantity).toBe(40);
    });

    test('should handle partial sales from multiple lots (FIFO order)', () => {
      const transactions = [
        {
          isin: 'TEST001',
          company: 'Test Company',
          type: 'BUY',
          share_count: 100,
          price: 50,
          trade_date: new Date('2023-01-01'),
        },
        {
          isin: 'TEST001',
          company: 'Test Company',
          type: 'BUY',
          share_count: 150,
          price: 60,
          trade_date: new Date('2023-03-01'),
        },
        {
          isin: 'TEST001',
          company: 'Test Company',
          type: 'SELL',
          share_count: 120,
          price: 80,
          trade_date: new Date('2023-06-01'),
        },
      ];

      const result = computePositions(transactions);
      
      // First lot (100 @ 50) fully sold, second lot (150 @ 60) partially sold
      // Remaining: 130 shares from second lot
      expect(result.openLotsByIsin['TEST001']).toHaveLength(1);
      expect(result.openLotsByIsin['TEST001'][0].quantity).toBe(130);
      expect(result.openLotsByIsin['TEST001'][0].price).toBe(60); // From second lot
      
      // Realized: 100 from first lot + 20 from second lot
      expect(result.realizedByIsin['TEST001']).toHaveLength(2);
      
      const realized1 = result.realizedByIsin['TEST001'][0];
      expect(realized1.quantity).toBe(100);
      expect(realized1.buy_price).toBe(50);
      expect(realized1.sell_price).toBe(80);
      
      const realized2 = result.realizedByIsin['TEST001'][1];
      expect(realized2.quantity).toBe(20);
      expect(realized2.buy_price).toBe(60);
      expect(realized2.sell_price).toBe(80);
    });

    test('should handle multiple buy and sell cycles', () => {
      const transactions = [
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 50, price: 100, trade_date: new Date('2023-01-01') },
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 50, price: 110, trade_date: new Date('2023-02-01') },
        { isin: 'TEST001', company: 'Test', type: 'SELL', share_count: 30, price: 120, trade_date: new Date('2023-03-01') },
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 40, price: 115, trade_date: new Date('2023-04-01') },
        { isin: 'TEST001', company: 'Test', type: 'SELL', share_count: 50, price: 130, trade_date: new Date('2023-05-01') },
      ];

      const result = computePositions(transactions);
      
      // Starting: 50 + 50 = 100
      // After 1st sell: 100 - 30 = 70
      // After 2nd buy: 70 + 40 = 110
      // After 2nd sell: 110 - 50 = 60
      
      const openQty = result.openLotsByIsin['TEST001'].reduce((sum, lot) => sum + lot.quantity, 0);
      expect(openQty).toBe(60);
      
      // Total realized: 30 + 50 = 80 shares
      const realizedQty = result.realizedByIsin['TEST001'].reduce((sum, sale) => sum + sale.quantity, 0);
      expect(realizedQty).toBe(80);
    });

    test('should handle multiple ISINs independently', () => {
      const transactions = [
        { isin: 'TEST001', company: 'Company A', type: 'BUY', share_count: 100, price: 50, trade_date: new Date('2023-01-01') },
        { isin: 'TEST002', company: 'Company B', type: 'BUY', share_count: 200, price: 30, trade_date: new Date('2023-01-15') },
        { isin: 'TEST001', company: 'Company A', type: 'SELL', share_count: 50, price: 60, trade_date: new Date('2023-02-01') },
      ];

      const result = computePositions(transactions);
      
      // TEST001: 100 bought, 50 sold = 50 remaining
      expect(result.openLotsByIsin['TEST001'][0].quantity).toBe(50);
      expect(result.realizedByIsin['TEST001']).toHaveLength(1);
      
      // TEST002: 200 bought, 0 sold = 200 remaining
      expect(result.openLotsByIsin['TEST002'][0].quantity).toBe(200);
      expect(result.realizedByIsin['TEST002']).toHaveLength(0);
    });

    test('should handle oversell scenario (edge case)', () => {
      const transactions = [
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 50, price: 100, trade_date: new Date('2023-01-01') },
        { isin: 'TEST001', company: 'Test', type: 'SELL', share_count: 70, price: 120, trade_date: new Date('2023-02-01') },
      ];

      // Should still process but log warning
      const result = computePositions(transactions);
      
      // All 50 bought shares are sold
      expect(result.openLotsByIsin['TEST001']).toHaveLength(0);
      
      // Realized should show 50 (not 70, as we only had 50)
      const realizedQty = result.realizedByIsin['TEST001'].reduce((sum, sale) => sum + sale.quantity, 0);
      expect(realizedQty).toBe(50);
    });

    test('should calculate trade count correctly', () => {
      const transactions = [
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 50, price: 100, trade_date: new Date('2023-01-01') },
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 50, price: 110, trade_date: new Date('2023-02-01') },
        { isin: 'TEST001', company: 'Test', type: 'SELL', share_count: 30, price: 120, trade_date: new Date('2023-03-01') },
      ];

      const result = computePositions(transactions);
      
      expect(result.tradeCountByIsin['TEST001']).toBe(3);
    });

    test('should calculate average holding days', () => {
      const transactions = [
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 100, price: 100, trade_date: new Date('2023-01-01') },
      ];

      const result = computePositions(transactions);
      
      // Should have some positive holding days
      expect(result.avgHoldingDaysByIsin['TEST001']).toBeGreaterThan(0);
    });

    test('should correctly calculate realized P/L', () => {
      const transactions = [
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 100, price: 50, trade_date: new Date('2023-01-01') },
        { isin: 'TEST001', company: 'Test', type: 'SELL', share_count: 100, price: 70, trade_date: new Date('2023-06-01') },
      ];

      const result = computePositions(transactions);
      const realized = result.realizedByIsin['TEST001'][0];
      
      const pnl = (realized.sell_price - realized.buy_price) * realized.quantity;
      expect(pnl).toBe(2000); // (70 - 50) * 100 = 2000
    });

  });

  describe('getCurrentOpenQuantity', () => {
    
    test('should return correct open quantity', () => {
      const transactions = [
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 100, price: 50, trade_date: new Date('2023-01-01') },
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 50, price: 55, trade_date: new Date('2023-02-01') },
        { isin: 'TEST001', company: 'Test', type: 'SELL', share_count: 30, price: 60, trade_date: new Date('2023-03-01') },
      ];

      const openQty = getCurrentOpenQuantity('TEST001', transactions);
      expect(openQty).toBe(120); // 100 + 50 - 30 = 120
    });

    test('should return 0 for non-existent ISIN', () => {
      const transactions = [
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 100, price: 50, trade_date: new Date('2023-01-01') },
      ];

      const openQty = getCurrentOpenQuantity('TEST999', transactions);
      expect(openQty).toBe(0);
    });

    test('should return 0 when all shares are sold', () => {
      const transactions = [
        { isin: 'TEST001', company: 'Test', type: 'BUY', share_count: 100, price: 50, trade_date: new Date('2023-01-01') },
        { isin: 'TEST001', company: 'Test', type: 'SELL', share_count: 100, price: 60, trade_date: new Date('2023-02-01') },
      ];

      const openQty = getCurrentOpenQuantity('TEST001', transactions);
      expect(openQty).toBe(0);
    });

  });

});

