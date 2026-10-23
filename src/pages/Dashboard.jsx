import React from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function Dashboard() {
  const { search, hash } = useLocation();
  return <Navigate to={`/${search}${hash}`} replace />;
}
