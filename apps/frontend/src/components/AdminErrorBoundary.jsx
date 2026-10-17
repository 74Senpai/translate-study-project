import { Component } from "react";
import AdminErrorPage from "@/pages/AdminErrorPage";

/**
 * Catches any unhandled React render errors in the admin panel
 * and displays a 500 error page instead of a blank screen crash.
 */
export default class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("AdminErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <AdminErrorPage
          code={500}
          message={
            this.state.error?.message ||
            "An unexpected error occurred in the admin panel. Please refresh the page."
          }
        />
      );
    }
    return this.props.children;
  }
}
