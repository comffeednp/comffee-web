"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  imageUrl?: string;
}

interface CartState {
  items: CartItem[];
}

type Action =
  | { type: "ADD"; item: CartItem }
  | { type: "REMOVE"; menuItemId: string }
  | { type: "SET_QTY"; menuItemId: string; qty: number }
  | { type: "CLEAR" }
  | { type: "HYDRATE"; state: CartState };

const STORAGE_KEY = "comffe.cart.v1";
const initial: CartState = { items: [] };

function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;
    case "ADD": {
      const existing = state.items.find((i) => i.menuItemId === action.item.menuItemId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.menuItemId === action.item.menuItemId
              ? { ...i, qty: i.qty + action.item.qty }
              : i,
          ),
        };
      }
      return { items: [...state.items, action.item] };
    }
    case "REMOVE":
      return { items: state.items.filter((i) => i.menuItemId !== action.menuItemId) };
    case "SET_QTY": {
      if (action.qty <= 0) {
        return { items: state.items.filter((i) => i.menuItemId !== action.menuItemId) };
      }
      return {
        items: state.items.map((i) =>
          i.menuItemId === action.menuItemId ? { ...i, qty: action.qty } : i,
        ),
      };
    }
    case "CLEAR":
      return initial;
    default:
      return state;
  }
}

interface CartContextValue {
  items: CartItem[];
  totalQty: number;
  totalPhp: number;
  addItem: (item: Omit<CartItem, "qty"> & { qty?: number }) => void;
  removeItem: (menuItemId: string) => void;
  setQty: (menuItemId: string, qty: number) => void;
  clear: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  hydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setOpen] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartState;
        if (parsed && Array.isArray(parsed.items)) {
          dispatch({ type: "HYDRATE", state: parsed });
        }
      }
    } catch {}
    setHydrated(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const addItem = useCallback(
    (item: Omit<CartItem, "qty"> & { qty?: number }) => {
      dispatch({
        type: "ADD",
        item: { ...item, qty: item.qty ?? 1 },
      });
      setOpen(true);
    },
    [],
  );

  const removeItem = useCallback((id: string) => {
    dispatch({ type: "REMOVE", menuItemId: id });
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    dispatch({ type: "SET_QTY", menuItemId: id, qty });
  }, []);

  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);

  const value = useMemo<CartContextValue>(() => {
    const totalQty = state.items.reduce((s, i) => s + i.qty, 0);
    const totalPhp = state.items.reduce((s, i) => s + i.qty * i.price, 0);
    return {
      items: state.items,
      totalQty,
      totalPhp,
      addItem,
      removeItem,
      setQty,
      clear,
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen((o) => !o),
      hydrated,
    };
  }, [state, addItem, removeItem, setQty, clear, isOpen, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
