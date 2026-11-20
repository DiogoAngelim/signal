import { Router } from 'express';
import legacy from './stocks-legacy';
import verified from './verified-investing';
const router = Router();
router.use('/investing', verified);
router.use((req, res, next) => {
  if (req.path !== '/strategy') return next();
  const original = res.json.bind(res);
  res.json = ((value: any) => {
    const mark = (v: any) => v && typeof v === 'object' ? { ...v, productionEligible: false, liveTradingApproved: false, verifiedEvidence: false,
      verificationReason: 'Legacy research is not prospective evidence. Use /api/investing for verified research and sizing.' } : v;
    const result = mark(value);
    if (result?.summary) result.summary = mark(result.summary);
    if (Array.isArray(result?.signals)) result.signals = result.signals.map((s: any) => ({ ...s, allocationAction: 'Hold', suggestedExposure: 0,
      productionEligible: false, liveTradingApproved: false, signalStatus: 'research_only' }));
    return original(result);
  }) as typeof res.json;
  next();
});
router.use(legacy);
export default router;
