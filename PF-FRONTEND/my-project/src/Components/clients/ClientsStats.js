import React from "react";
import {
  FaUsers,
  FaUser,
  FaUserTie,
  FaMapMarkerAlt,
} from "react-icons/fa";
import { motion } from "framer-motion";
import { SkeletonStats } from "../../utils/SkeletonLoading";

const CARDS = [
  {
    key: "total",
    label: "Total Clientes",
    icon: FaUsers,
    color: "bg-slate-500",
  },
  {
    key: "page",
    label: "En esta Página",
    icon: FaUser,
    color: "bg-blue-500",
  },
  {
    key: "unassigned",
    label: "Sin Vendedor",
    icon: FaUserTie,
    color: "bg-amber-500",
  },
  {
    key: "regions",
    label: "Ciudades",
    icon: FaMapMarkerAlt,
    color: "bg-purple-500",
  },
];

export const ClientsStats = ({
  stats,
  salesData,
  loading,
}) => {
  if (loading && !salesData?.length) {
    return <SkeletonStats />;
  }

  const values = {
    total: stats?.total || 0,
    page: salesData?.length || 0,
    unassigned: stats?.unassigned || 0,
    regions: stats?.regions || 0,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      {CARDS.map((card) => {
        const Icon = card.icon;

        return (
          <motion.div
            key={card.key}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="
              relative
              overflow-hidden
              bg-white
              rounded-2xl
              border
              border-gray-200
              shadow-sm
              hover:shadow-xl
              p-5
            "
          >
            <div
              className={`absolute top-0 left-0 w-full h-1 ${card.color}`}
            />

            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">
                  {card.label}
                </p>

                <h3 className="text-3xl font-bold text-gray-900">
                  {values[card.key]}
                </h3>
              </div>

              <div
                className={`
                  w-14 h-14
                  rounded-2xl
                  flex
                  items-center
                  justify-center
                  text-white
                  ${card.color}
                `}
              >
                <Icon size={22} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};