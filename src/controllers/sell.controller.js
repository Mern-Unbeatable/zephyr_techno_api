import attributesService from "../services/attributes.service.js";
import sellService from "../services/sell.service.js";
import asyncHandler from "../utils/async-handler.js";
import sellEventEmitter from "../utils/sell-events.js";

// ---------------------------------------------------------------------------
// Demo "bought" notifications — cycled every 30 s when no real sell has fired.
// Only "bought" actions live here; real DB events always carry action:"sold"
// so the frontend can tell them apart and style them differently if needed.
// ---------------------------------------------------------------------------
const DEMO_BOUGHT = [
  { name: "James K.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Daniel O.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Marcus T.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Chris P.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Noah F.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Tyler G.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Ahmed L.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Kevin T.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Ryan C.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Leon A.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Omar Y.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Ethan W.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Sean V.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Caleb M.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Ivan B.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Malik T.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Ravi P.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Joel A.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Tariq H.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Felix O.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Blake S.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Hugo L.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Andre B.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Kofi T.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Jared N.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Diego R.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Noel D.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Aryan W.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Miles B.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Owen M.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Eli F.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Kai P.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Liam T.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Sam R.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Theo D.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Max W.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Ivan S.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Rex L.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Beck C.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Troy N.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Finn K.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Luke A.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Cyrus H.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Beau O.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Axel S.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Kurt L.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Drew C.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Jace N.", action: "bought", phone: "iPhone 17 Pro Max" },
  { name: "Cole K.", action: "bought", phone: "iPhone 17 Pro Max" },
];

class SellController {
  // Map internal SellStatus -> admin-facing labels
  mapStatusToAdmin(status) {
    const map = {
      SUBMITTED: "NEW",
      OFFER_MADE: "CONTRACTED",
    };
    return map[status] || status;
  }

  getAllSeries = asyncHandler(async (req, res) => {
    const data = await attributesService.getAllSeries();
    res.status(200).json({ success: true, data });
  });

  getModelsBySeries = asyncHandler(async (req, res) => {
    const seriesId = req.query.seriesId;
    const data = await attributesService.getAllDeviceModels({ seriesId });
    res.status(200).json({ success: true, data });
  });

  getAllConditions = asyncHandler(async (req, res) => {
    const data = await attributesService.getAllConditions();
    res.status(200).json({ success: true, data });
  });

  getPrice = asyncHandler(async (req, res) => {
    const { conditionId, deviceModelId } = req.query;
    if (!conditionId || !deviceModelId)
      return res.status(400).json({
        success: false,
        message: "conditionId and deviceModelId are required.",
      });
    const price = await attributesService.resolvePriceFor(
      conditionId,
      deviceModelId,
    );
    res.status(200).json({ success: true, data: { price } });
  });

  finalizeSale = asyncHandler(async (req, res) => {
    const payload = req.body;

    // Support `fullName` or `firstName` + `lastName`
    let firstName = payload.firstName;
    let lastName = payload.lastName;
    if (!firstName && payload.fullName) {
      const parts = payload.fullName.trim().split(/\s+/);
      firstName = parts.shift();
      lastName = parts.join(" ");
    }

    // Require model identification so we can resolve server-side price
    const {
      deviceModelId,
      conditionId,
      baseOfferPrice,
      images,
      serialNumber,
      email,
      phone,
    } = payload;
    if (!deviceModelId)
      return res
        .status(400)
        .json({ success: false, message: "deviceModelId is required." });
    if (!conditionId)
      return res
        .status(400)
        .json({ success: false, message: "conditionId is required." });

    // Compute server-side price
    const serverPrice = await attributesService.resolvePriceFor(
      conditionId,
      deviceModelId,
    );

    // Compare with client-submitted price
    const userOfferedPrice =
      baseOfferPrice !== undefined && baseOfferPrice !== null
        ? parseFloat(baseOfferPrice)
        : null;
    const basePriceToStore = serverPrice; // authoritative

    // Create sell request storing both userOfferedPrice and server-computed baseOfferPrice
    const rec = await sellService.createSellRequest({
      firstName,
      lastName,
      email: payload.email,
      phone: payload.phone,
      deviceName: payload.deviceName || "",
      deviceModelId,
      conditionId,
      baseOfferPrice: basePriceToStore,
      userOfferedPrice,
      serialNumber,
      images,
    });

    res.status(201).json({
      success: true,
      message: "Sell request submitted.",
      data: rec,
      price: {
        serverPrice,
        userOfferedPrice,
        priceVerified:
          userOfferedPrice === null
            ? false
            : parseFloat(serverPrice) === parseFloat(userOfferedPrice),
      },
    });
  });

  // Admin: list sell requests with pagination and filters
  adminGetAll = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, search, deviceModelId } = req.query;
    const result = await sellService.getAllSellRequests({
      page,
      limit,
      status,
      search,
      deviceModelId,
    });

    // Transform for admin UI: hide stringId/userId, provide fullName, map status
    const transformed = result.data.map((r) => {
      const fullName = [r.firstName, r.lastName].filter(Boolean).join(" ");
      const statusMap = this.mapStatusToAdmin(r.status);
      return {
        id: r.id,
        fullName,
        email: r.email,
        phone: r.phone,
        deviceModelName: r.deviceModel?.name || null,
        conditionName: r.condition?.name || null,
        baseOfferPrice: r.baseOfferPrice,
        userOfferedPrice: r.userOfferedPrice,
        status: statusMap,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        isDeleted: r.isDeleted,
        deletedAt: r.deletedAt,
        images: r.images || [],
      };
    });

    const pageNum = parseInt(page, 10) || 1;
    const lim = parseInt(limit, 10) || 20;
    const total = result.meta?.total || 0;
    const meta = {
      page: pageNum,
      limit: lim,
      total,
      hasNext: pageNum * lim < total,
      hasPrevious: pageNum > 1,
    };

    res.status(200).json({ success: true, data: transformed, meta });
  });

  // Admin: get single sell request by id
  adminGetById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const rec = await sellService.getSellRequestById(id);
    const fullName = [rec.firstName, rec.lastName].filter(Boolean).join(" ");
    const statusMap = this.mapStatusToAdmin(rec.status);
    const transformed = {
      id: rec.id,
      fullName,
      email: rec.email,
      phone: rec.phone,
      deviceModelName: rec.deviceModel?.name || null,
      conditionName: rec.condition?.name || null,
      baseOfferPrice: rec.baseOfferPrice,
      userOfferedPrice: rec.userOfferedPrice,
      status: statusMap,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      isDeleted: rec.isDeleted,
      deletedAt: rec.deletedAt,
      images: rec.images || [],
    };

    res.status(200).json({ success: true, data: transformed });
  });

  // Admin: update sell request
  adminUpdate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = { ...req.body };

    // Accept admin-friendly status values and map to internal SellStatus
    if (payload.status) {
      const statusMap = {
        NEW: "SUBMITTED",
        CONTRACTED: "OFFER_MADE",
      };
      const mapped = statusMap[payload.status] || payload.status;

      const allowed = [
        "SUBMITTED",
        "RECEIVED",
        "INSPECTION",
        "OFFER_MADE",
        "PAID",
        "REJECTED",
      ];
      if (!allowed.includes(mapped)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid status value." });
      }

      payload.status = mapped;
    }

    const rec = await sellService.updateSellRequest(id, payload);

    // Transform updated record for admin response
    const fullName = [rec.firstName, rec.lastName].filter(Boolean).join(" ");
    const transformed = {
      id: rec.id,
      fullName,
      email: rec.email,
      phone: rec.phone,
      deviceModelName: rec.deviceModel?.name || null,
      conditionName: rec.condition?.name || null,
      baseOfferPrice: rec.baseOfferPrice,
      userOfferedPrice: rec.userOfferedPrice,
      status: this.mapStatusToAdmin(rec.status),
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      isDeleted: rec.isDeleted,
      deletedAt: rec.deletedAt,
      images: rec.images || [],
    };

    res.status(200).json({ success: true, data: transformed });
  });

  // Admin: delete (soft-delete) sell request
  adminDelete = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await sellService.deleteSellRequest(id);
    res.status(200).json({ success: true, message: "Sell request deleted." });
  });

  /**
   * GET /api/sell/activity-stream
   *
   * Serial 30 s ticker — exactly ONE notification per tick:
   *
   *   • If a real "sold" event arrived since the last tick → send it (FIFO).
   *   • Otherwise → send the next demo "bought" from DEMO_BOUGHT.
   *
   * Real events are never sent immediately; they sit in a small queue and
   * are drained one-per-tick so the cadence stays perfectly uniform.
   */
  streamSellActivity = (req, res) => {
    // ── SSE headers ──────────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // ── Write helper ───────────────────────────────────────────────────────────
    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (typeof res.flush === "function") res.flush();
    };

    // ── Keep-alive ping every 25 s ───────────────────────────────────────────
    const keepAlive = setInterval(() => {
      res.write(": keep-alive\n\n");
      if (typeof res.flush === "function") res.flush();
    }, 25_000);

    // ── Real-event queue ───────────────────────────────────────────────────────
    // Real sold events are pushed here instead of being sent immediately.
    // The ticker below drains one entry per 30 s tick.
    const realQueue = [];

    const onNewSell = (payload) => {
      realQueue.push(payload);
    };

    sellEventEmitter.on("new-sell", onNewSell);

    // ── Serial ticker ──────────────────────────────────────────────────────────
    // One notification per tick:
    //   real sold in queue (FIFO) → takes priority over demo
    //   queue empty               → next demo bought
    let demoIndex = Math.floor(Math.random() * DEMO_BOUGHT.length);
    let ticker = null;

    const tick = () => {
      if (realQueue.length > 0) {
        send(realQueue.shift());
      } else {
        send(DEMO_BOUGHT[demoIndex % DEMO_BOUGHT.length]);
        demoIndex++;
      }
    };

    // First notification after 5 s, then one every 30 s continuously.
    const initialDelay = setTimeout(() => {
      tick();
      ticker = setInterval(tick, 30_000);
    }, 5_000);

    // ── Cleanup on client disconnect ─────────────────────────────────────────
    req.on("close", () => {
      clearTimeout(initialDelay);
      clearInterval(ticker);
      clearInterval(keepAlive);
      sellEventEmitter.off("new-sell", onNewSell);
    });
  };
}

export default new SellController();
