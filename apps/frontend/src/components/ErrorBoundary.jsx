import { Component } from "react";
import ErrorPage from "@/pages/ErrorPage";

/**
 * Catches any unhandled React render errors and displays a 500 page
 * instead of crashing the entire app with a blank screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPage
          code={500}
          message={
            this.state.error?.message ||
            "An unexpected error occurred. Please refresh or return to the home page."
          }
        />
      );
    }
    return this.props.children;
  }
}
