import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
} from "lucide-react";
import axiosInstance from "@/services/axiosInstance";
import { useAuth } from "@/hooks/useAuth";
import { useNotify } from "@/hooks/useNotify";

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const notify = useNotify();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(["ADMIN", "MANAGER", "CREATOR", "USER"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  const isCurrentUserAdmin = currentUser?.roles?.includes("ADMIN");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        axiosInstance.get("/admin/users"),
        axiosInstance
          .get("/admin/roles")
          .catch(() => ({ data: ["ADMIN", "MANAGER", "CREATOR", "USER"] })),
      ]);
      setUsers(usersRes.data);
      if (rolesRes.data?.length > 0) {
        setRoles(rolesRes.data);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      await axiosInstance.patch(`/admin/users/${userId}/role`, {
        new_role: newRole,
      });
      setUsers(
        users.map((u) => {
          if (u.id === userId) {
            return { ...u, roles: [newRole] };
          }
          return u;
        }),
      );
      notify.success("User role updated successfully");
    } catch (err) {
      notify.error(err.response?.data?.detail || "Failed to update role");
    }
  };

  const canChangeRole = (targetUser) => {
    if (isCurrentUserAdmin) return true;

    const targetRoles = targetUser.roles || [];
    if (targetRoles.includes("ADMIN") || targetRoles.includes("MANAGER")) {
      return false;
    }

    if (targetUser.id === currentUser.id) return false;

    return true;
  };

  const getAvailableRolesForTarget = () => {
    if (isCurrentUserAdmin) return roles;
    return roles.filter((r) => !["ADMIN", "MANAGER"].includes(r));
  };

  // Filter logic
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const search = searchTerm.toLowerCase();
      const displayName = (u.display_name || "").toLowerCase();
      const username = (u.username || "").toLowerCase();

      const matchesSearch =
        displayName.includes(search) || username.includes(search);

      const userRole = u.roles?.[0] || "USER";
      const matchesRole = roleFilter === "ALL" || userRole === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  if (loading)
    return (
      <div className="p-10 text-center text-slate-500 font-medium">
        Loading users...
      </div>
    );
  if (error)
    return (
      <div className="p-10 text-center text-red-500 font-medium">
        Error: {error}
      </div>
    );

  return (
    <div className="animate-in fade-in duration-300 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 m-0 tracking-tight">
              User Management
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Manage user roles and access permissions.
            </p>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="relative w-full sm:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer font-medium text-slate-700"
            >
              <option value="ALL">All Roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  User
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  Joined
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  Stats
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 text-right">
                  Role
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((u) => {
                  const isTargetAdmin = u.roles?.includes("ADMIN");
                  const isTargetManager = u.roles?.includes("MANAGER");

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt="avatar"
                              className="w-10 h-10 rounded-full"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold shadow-inner">
                              {(u.display_name || u.username || "?")
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-bold text-slate-800 m-0">
                              {u.display_name || u.username || "Unnamed User"}
                            </p>
                            <p className="text-xs font-mono text-slate-400 m-0">
                              {u.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-600 font-medium m-0">
                          {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[10px] text-slate-500 font-bold m-0 tracking-widest uppercase bg-slate-100 px-2 py-1 rounded-md inline-block">
                          {u.xp} XP <span className="mx-1 opacity-50">•</span>{" "}
                          {u.streak_days} DAY STREAK
                        </p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canChangeRole(u) ? (
                          <select
                            className="text-sm font-bold bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all cursor-pointer"
                            value={u.roles?.[0] || "USER"}
                            onChange={(e) =>
                              handleRoleChange(u.id, e.target.value)
                            }
                          >
                            {getAvailableRolesForTarget(u).map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider
                            ${isTargetAdmin ? "bg-purple-100 text-purple-700" : isTargetManager ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}
                          `}
                          >
                            {isTargetAdmin ? (
                              <ShieldAlert className="w-3.5 h-3.5" />
                            ) : isTargetManager ? (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            ) : (
                              <Shield className="w-3.5 h-3.5" />
                            )}
                            <span>{u.roles?.[0] || "USER"}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">
                      No users found matching your query.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
