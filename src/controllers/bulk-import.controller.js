import bulkImportService from '../services/bulk-import.service.js';
import asyncHandler from '../utils/async-handler.js';

const isDryRun = (value) => !(value === false || value === 'false' || value === 0 || value === '0');

class BulkImportController {
  importConditionModelPrices = asyncHandler(async (req, res) => {
    const { rows, dryRun } = req.body || {};
    const data = await bulkImportService.importConditionModelPrices({
      rows,
      dryRun: isDryRun(dryRun),
    });
    res.status(200).json({
      success: true,
      message: data.applied ? 'Prices imported successfully.' : 'Preview generated.',
      data,
    });
  });

  exportProductVariants = asyncHandler(async (req, res) => {
    const data = await bulkImportService.exportProductVariants();
    res.status(200).json({ success: true, data });
  });

  importProductVariants = asyncHandler(async (req, res) => {
    const { rows, dryRun } = req.body || {};
    const data = await bulkImportService.importProductVariants({
      rows,
      dryRun: isDryRun(dryRun),
    });
    res.status(200).json({
      success: true,
      message: data.applied ? 'Products updated successfully.' : 'Preview generated.',
      data,
    });
  });
}

export default new BulkImportController();
