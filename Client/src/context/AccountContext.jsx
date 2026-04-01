import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  cancelTicketBooking,
  fetchCurrentCustomerAccount,
  fetchTicketBookingDetails,
  fetchTicketBookings,
  loginCustomerAccount,
  logoutCustomerAccount,
  registerCustomerAccount,
  updateCurrentCustomerAccount,
  uploadCurrentCustomerPhoto
} from "../services/api";

const ACCOUNT_USER_STORAGE_KEY = "cinevillage_account_user";

const defaultUser = {
  id: "",
  name: "Guest",
  email: "",
  contact: "",
  profilePic: "/images/cameraplaceholder.jpg"
};

const AccountContext = createContext(null);

function normalizeText(value) {
  return (value || "").toString().trim();
}

function normalizeStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "completed") return "completed";
  if (normalized === "incomplete") return "incomplete";
  if (normalized === "scheduled") return "scheduled";
  return "incomplete";
}

function normalizeHallType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "imax") return "IMAX";
  if (normalized === "vip") return "VIP";
  return "Standard";
}

function normalizeUser(raw) {
  if (!raw || typeof raw !== "object") return defaultUser;

  return {
    id: normalizeText(raw.id || raw._id),
    name: normalizeText(raw.name) || "Guest",
    email: normalizeText(raw.email).toLowerCase(),
    contact: normalizeText(raw.contact),
    profilePic: normalizeText(raw.profilePic) || "/images/cameraplaceholder.jpg"
  };
}

function normalizeBooking(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = normalizeText(raw.id || raw.bookingId || raw._id);
  if (!id) return null;

  return {
    id,
    bookingId: id,
    bookingCode: normalizeText(raw.bookingCode),
    movieName: normalizeText(raw.movieName) || "N/A",
    hallName: normalizeText(raw.hallName) || "N/A",
    hallType: normalizeHallType(raw.hallType),
    date: normalizeText(raw.date),
    time: normalizeText(raw.time) || "N/A",
    purchaseDate: normalizeText(raw.purchaseDate),
    purchaseTime: normalizeText(raw.purchaseTime) || "N/A",
    purchaseDateTime: normalizeText(raw.purchaseDateTime),
    status: normalizeStatus(raw.status),
    seats: Array.isArray(raw.seats) ? raw.seats : [],
    addons: Array.isArray(raw.addons) ? raw.addons : [],
    total: Number(raw.total) || 0,
    promoDiscount: Number(raw.promoDiscount) || 0,
    bookingFee: Number(raw.bookingFee) || 0,
    ticketSubtotal: Number(raw.ticketSubtotal) || 0,
    qrCodeUrl: normalizeText(raw.qrCodeUrl),
    qrPayloadText: normalizeText(raw.qrPayloadText),
    screeningId: normalizeText(raw.screeningId),
    movieId: normalizeText(raw.movieId),
    customerName: normalizeText(raw.customerName),
    customerEmail: normalizeText(raw.customerEmail),
    customerPhone: normalizeText(raw.customerPhone)
  };
}

function readStoredUser() {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_USER_STORAGE_KEY);
    if (!raw) return defaultUser;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultUser;
    return normalizeUser(parsed);
  } catch (_error) {
    return defaultUser;
  }
}

function saveStoredUser(user) {
  try {
    window.localStorage.setItem(ACCOUNT_USER_STORAGE_KEY, JSON.stringify(user));
  } catch (_error) {
    // Ignore storage failures.
  }
}

function clearStoredUser() {
  try {
    window.localStorage.removeItem(ACCOUNT_USER_STORAGE_KEY);
  } catch (_error) {
    // Ignore storage failures.
  }
}

export function AccountProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const [bookings, setBookings] = useState([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [bookingsError, setBookingsError] = useState("");
  const [isAuthHydrating, setIsAuthHydrating] = useState(true);
  const isAuthenticated = Boolean(normalizeText(user?.id) && normalizeText(user?.email));

  const refreshBookings = useCallback(async (options = {}) => {
    setIsLoadingBookings(true);
    setBookingsError("");

    try {
      const requestedEmail = normalizeText(options?.email || "").toLowerCase();
      const activeEmail = requestedEmail || (isAuthenticated ? normalizeText(user?.email).toLowerCase() : "");
      if (!activeEmail) {
        setBookings([]);
        return [];
      }

      const items = await fetchTicketBookings();
      const normalized = items.map(normalizeBooking).filter(Boolean);
      setBookings(normalized);
      return normalized;
    } catch (error) {
      if (Number(error?.status) === 401) {
        setUser(defaultUser);
        clearStoredUser();
        setBookings([]);
        setBookingsError("");
        return [];
      }
      setBookingsError(error?.message || "Failed to load bookings.");
      return [];
    } finally {
      setIsLoadingBookings(false);
    }
  }, [isAuthenticated, user?.email]);

  useEffect(() => {
    let isActive = true;

    async function hydrateFromJwtSession() {
      setIsAuthHydrating(true);
      try {
        const profile = await fetchCurrentCustomerAccount();
        if (!isActive || !profile) return;

        const normalized = normalizeUser(profile);
        setUser(normalized);
        saveStoredUser(normalized);

        const items = await fetchTicketBookings();
        if (!isActive) return;
        const normalizedBookings = items.map(normalizeBooking).filter(Boolean);
        setBookings(normalizedBookings);
        setBookingsError("");
      } catch (_error) {
        if (!isActive) return;
        setUser(defaultUser);
        clearStoredUser();
        setBookings([]);
        setBookingsError("");
      } finally {
        if (isActive) setIsAuthHydrating(false);
      }
    }

    hydrateFromJwtSession();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthHydrating) return;
    if (!isAuthenticated) {
      setBookings([]);
      setBookingsError("");
      return;
    }
    refreshBookings({ email: user?.email });
  }, [isAuthHydrating, isAuthenticated, refreshBookings, user?.email]);

  const updateUser = useCallback((patch = {}) => {
    setUser((previous) => {
      const next = normalizeUser({
        ...previous,
        ...patch,
        name: normalizeText(patch.name ?? previous.name) || previous.name,
        email: normalizeText(patch.email ?? previous.email) || previous.email,
        contact: normalizeText(patch.contact ?? previous.contact) || previous.contact,
        profilePic: normalizeText(patch.profilePic ?? previous.profilePic) || previous.profilePic
      });
      saveStoredUser(next);
      return next;
    });
  }, []);

  const updateCustomerProfile = useCallback(async (payload = {}) => {
    const updated = await updateCurrentCustomerAccount(payload);
    const normalized = normalizeUser(updated);
    setUser(normalized);
    saveStoredUser(normalized);
    return normalized;
  }, []);

  const updateCustomerPhoto = useCallback(async (file) => {
    const updated = await uploadCurrentCustomerPhoto(file);
    const normalized = normalizeUser(updated);
    setUser(normalized);
    saveStoredUser(normalized);
    return normalized;
  }, []);

  const registerCustomer = useCallback(async (payload = {}) => {
    const created = await registerCustomerAccount(payload);
    return normalizeUser(created);
  }, []);

  const loginCustomer = useCallback(async (payload = {}) => {
    const loggedIn = await loginCustomerAccount(payload);
    const normalized = normalizeUser(loggedIn);
    setUser(normalized);
    saveStoredUser(normalized);
    await refreshBookings({ email: normalized.email });
    return normalized;
  }, [refreshBookings]);

  const logoutCustomer = useCallback(async () => {
    try {
      await logoutCustomerAccount();
    } catch (_error) {
      // Ignore logout API failures and clear local state anyway.
    }
    setUser(defaultUser);
    clearStoredUser();
    setBookings([]);
    setBookingsError("");
  }, []);

  const getBookingById = useCallback((bookingId) => {
    const id = normalizeText(bookingId);
    if (!id) return null;
    return bookings.find((booking) => booking.id === id) || null;
  }, [bookings]);

  const ensureBookingById = useCallback(async (bookingId) => {
    const id = normalizeText(bookingId);
    if (!id) return null;

    const existing = bookings.find((booking) => booking.id === id) || null;
    if (existing) return existing;

    const fetched = await fetchTicketBookingDetails(id);
    const normalized = normalizeBooking(fetched);
    if (!normalized) return null;

    setBookings((previous) => {
      const exists = previous.some((booking) => booking.id === normalized.id);
      if (exists) {
        return previous.map((booking) => booking.id === normalized.id ? normalized : booking);
      }
      return [normalized, ...previous];
    });

    return normalized;
  }, [bookings]);

  const cancelBooking = useCallback(async (bookingId) => {
    const id = normalizeText(bookingId);
    if (!id) return null;

    setBookings((previous) =>
      previous.map((booking) =>
        booking.id === id
          ? { ...booking, status: "cancelled" }
          : booking
      )
    );

    try {
      const updated = await cancelTicketBooking(id);
      const normalized = normalizeBooking(updated);
      if (!normalized) return null;

      setBookings((previous) =>
        previous.map((booking) =>
          booking.id === id ? normalized : booking
        )
      );

      return normalized;
    } catch (error) {
      await refreshBookings();
      throw error;
    }
  }, [refreshBookings]);

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isAuthHydrating,
    bookings,
    isLoadingBookings,
    bookingsError,
    updateUser,
    updateCustomerProfile,
    updateCustomerPhoto,
    registerCustomer,
    loginCustomer,
    logoutCustomer,
    refreshBookings,
    cancelBooking,
    getBookingById,
    ensureBookingById
  }), [
    user,
    isAuthenticated,
    isAuthHydrating,
    bookings,
    isLoadingBookings,
    bookingsError,
    updateUser,
    updateCustomerProfile,
    updateCustomerPhoto,
    registerCustomer,
    loginCustomer,
    logoutCustomer,
    refreshBookings,
    cancelBooking,
    getBookingById,
    ensureBookingById
  ]);

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used inside AccountProvider");
  }
  return context;
}
