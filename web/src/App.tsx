import { lazy } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "./components/shell/Layout";
import { Compare, HowItWorks } from "./pages/ComingNext";

const Trends = lazy(() => import("./pages/Trends"));
const Leaders = lazy(() => import("./pages/Leaders"));
const Players = lazy(() => import("./pages/Players"));
const NotFound = lazy(() => import("./pages/NotFound"));

export const routes = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <Trends /> },
      { path: "leaders", element: <Leaders /> },
      { path: "compare", element: <Compare /> },
      { path: "players", element: <Players /> },
      { path: "players/:playerId", element: <Players /> },
      { path: "how-it-works", element: <HowItWorks /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App() {
  return <RouterProvider router={router} />;
}
