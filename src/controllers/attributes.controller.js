import attributesService from '../services/attributes.service.js';
import asyncHandler from '../utils/async-handler.js';

/**
 * Admin Attributes Controller
 * Handles CRUD for: Category, Series, DeviceModel, Condition, Color, StorageOption, RamOption
 * Arrow-field class pattern — `this` is always correctly bound (same as auth.controller.js).
 */
class AttributesController {
  constructor(service = attributesService) {
    this.service = service;
  }

  // ─── CONSOLIDATED OPTIONS ────────────────────────────────────

  getAllAttributeOptions = asyncHandler(async (req, res) => {
    const data = await this.service.getAllAttributeOptions();
    res.status(200).json({ success: true, data });
  });

  // Public consolidated attributes for product listing filters
  getPublicProductAttributes = asyncHandler(async (req, res) => {
    const response = await this.service.getPublicAttributes();
    res.status(200).json({ success: true, data: response });
  });

  // ─── CATEGORY ────────────────────────────────────────────────

  createCategory = asyncHandler(async (req, res) => {
    const data = await this.service.createCategory(req.body);
    res.status(201).json({ success: true, message: 'Category created.', data });
  });

  getAllCategories = asyncHandler(async (req, res) => {
    const data = await this.service.getAllCategories();
    res.status(200).json({ success: true, data });
  });

  getCategoryById = asyncHandler(async (req, res) => {
    const data = await this.service.getCategoryById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateCategory = asyncHandler(async (req, res) => {
    const data = await this.service.updateCategory(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Category updated.', data });
  });

  deleteCategory = asyncHandler(async (req, res) => {
    await this.service.deleteCategory(req.params.id);
    res.status(200).json({ success: true, message: 'Category deleted.' });
  });

  // ─── SERIES ──────────────────────────────────────────────────

  createSeries = asyncHandler(async (req, res) => {
    const data = await this.service.createSeries(req.body, req.file);
    res.status(201).json({ success: true, message: 'Series created.', data });
  });

  getAllSeries = asyncHandler(async (req, res) => {
    const data = await this.service.getAllSeries();
    res.status(200).json({ success: true, data });
  });

  getSeriesById = asyncHandler(async (req, res) => {
    const data = await this.service.getSeriesById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateSeries = asyncHandler(async (req, res) => {
    const data = await this.service.updateSeries(req.params.id, req.body, req.file);
    res.status(200).json({ success: true, message: 'Series updated.', data });
  });

  deleteSeries = asyncHandler(async (req, res) => {
    await this.service.deleteSeries(req.params.id);
    res.status(200).json({ success: true, message: 'Series deleted.' });
  });

  // ─── DEVICE MODEL ────────────────────────────────────────────

  createDeviceModel = asyncHandler(async (req, res) => {
    const data = await this.service.createDeviceModel(req.body);
    res.status(201).json({ success: true, message: 'Model created.', data });
  });

  getAllDeviceModels = asyncHandler(async (req, res) => {
    const filters = {};
    if (req.query.seriesId) filters.seriesId = req.query.seriesId;
    const data = await this.service.getAllDeviceModels(filters);
    res.status(200).json({ success: true, data });
  });

  getDeviceModelById = asyncHandler(async (req, res) => {
    const data = await this.service.getDeviceModelById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateDeviceModel = asyncHandler(async (req, res) => {
    const data = await this.service.updateDeviceModel(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Model updated.', data });
  });

  deleteDeviceModel = asyncHandler(async (req, res) => {
    await this.service.deleteDeviceModel(req.params.id);
    res.status(200).json({ success: true, message: 'Model deleted.' });
  });

  // ─── CONDITION (name management) ─────────────────────────────

  createCondition = asyncHandler(async (req, res) => {
    const data = await this.service.createCondition(req.body);
    res.status(201).json({ success: true, message: 'Condition created.', data });
  });

  getAllConditions = asyncHandler(async (req, res) => {
    const data = await this.service.getAllConditions();
    res.status(200).json({ success: true, data });
  });

  getConditionById = asyncHandler(async (req, res) => {
    const data = await this.service.getConditionById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateCondition = asyncHandler(async (req, res) => {
    const data = await this.service.updateCondition(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Condition updated.', data });
  });

  deleteCondition = asyncHandler(async (req, res) => {
    await this.service.deleteCondition(req.params.id);
    res.status(200).json({ success: true, message: 'Condition deleted.' });
  });

  

  // ─── CONDITION-MODEL PRICES (per-model pricing) ────────────

  getAllConditionModelPrices = asyncHandler(async (req, res) => {
    const data = await this.service.getAllConditionModelPrices();
    res.status(200).json({ success: true, data });
  });

  createConditionModelPrice = asyncHandler(async (req, res) => {
    const data = await this.service.createConditionModelPrice(req.body);
    res.status(201).json({ success: true, message: 'Condition price for model created.', data });
  });

  getConditionModelPriceById = asyncHandler(async (req, res) => {
    const data = await this.service.getConditionModelPriceById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateConditionModelPrice = asyncHandler(async (req, res) => {
    const data = await this.service.updateConditionModelPrice(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Condition model price updated.', data });
  });

  deleteConditionModelPrice = asyncHandler(async (req, res) => {
    await this.service.deleteConditionModelPrice(req.params.id);
    res.status(200).json({ success: true, message: 'Condition model price deleted.' });
  });

  // ─── COLOR ───────────────────────────────────────────────────

  createColor = asyncHandler(async (req, res) => {
    const data = await this.service.createColor(req.body);
    res.status(201).json({ success: true, message: 'Color created.', data });
  });

  getAllColors = asyncHandler(async (req, res) => {
    const data = await this.service.getAllColors();
    res.status(200).json({ success: true, data });
  });

  getColorById = asyncHandler(async (req, res) => {
    const data = await this.service.getColorById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateColor = asyncHandler(async (req, res) => {
    const data = await this.service.updateColor(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Color updated.', data });
  });

  deleteColor = asyncHandler(async (req, res) => {
    await this.service.deleteColor(req.params.id);
    res.status(200).json({ success: true, message: 'Color deleted.' });
  });

  // ─── STORAGE OPTION ──────────────────────────────────────────

  createStorageOption = asyncHandler(async (req, res) => {
    const data = await this.service.createStorageOption(req.body);
    res.status(201).json({ success: true, message: 'Storage option created.', data });
  });

  getAllStorageOptions = asyncHandler(async (req, res) => {
    const data = await this.service.getAllStorageOptions();
    res.status(200).json({ success: true, data });
  });

  getStorageOptionById = asyncHandler(async (req, res) => {
    const data = await this.service.getStorageOptionById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateStorageOption = asyncHandler(async (req, res) => {
    const data = await this.service.updateStorageOption(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Storage option updated.', data });
  });

  deleteStorageOption = asyncHandler(async (req, res) => {
    await this.service.deleteStorageOption(req.params.id);
    res.status(200).json({ success: true, message: 'Storage option deleted.' });
  });

  // ─── RAM OPTION ──────────────────────────────────────────────

  createRamOption = asyncHandler(async (req, res) => {
    const data = await this.service.createRamOption(req.body);
    res.status(201).json({ success: true, message: 'RAM option created.', data });
  });

  getAllRamOptions = asyncHandler(async (req, res) => {
    const data = await this.service.getAllRamOptions();
    res.status(200).json({ success: true, data });
  });

  getRamOptionById = asyncHandler(async (req, res) => {
    const data = await this.service.getRamOptionById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateRamOption = asyncHandler(async (req, res) => {
    const data = await this.service.updateRamOption(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'RAM option updated.', data });
  });

  deleteRamOption = asyncHandler(async (req, res) => {
    await this.service.deleteRamOption(req.params.id);
    res.status(200).json({ success: true, message: 'RAM option deleted.' });
  });
}

export default new AttributesController();
