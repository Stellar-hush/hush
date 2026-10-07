/**
 * Example usage of the Demo Inbox Preview components.
 *
 * This file demonstrates how to integrate the demo inbox preview
 * into the admin dashboard without connecting to live systems.
 */

import { DemoInboxPreview } from "../components/DemoInboxPreview";

/**
 * Basic usage example for the demo admin dashboard.
 */
export function DemoAdminInboxExample() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Demo Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage and preview demo data for the Hush mail system
        </p>
      </div>

      <DemoInboxPreview />

      <div className="mt-8 p-4 bg-muted/20 rounded-lg border">
        <h3 className="font-semibold mb-2">Integration Notes</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• All data is fake and safe for public repository review</li>
          <li>• No integration with live inbox or mail processing systems</li>
          <li>• Components mirror real inbox functionality for authentic preview</li>
          <li>• Fully isolated demo environment for maintainer testing</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Advanced usage example with custom filtering and selection.
 */
export function DemoInboxAdvancedExample() {
  return (
    <div className="container mx-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main inbox preview */}
        <div className="lg:col-span-2">
          <DemoInboxPreview />
        </div>

        {/* Sidebar with additional info */}
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-3">Demo Data Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total messages:</span>
                <span className="font-medium">10</span>
              </div>
              <div className="flex justify-between">
                <span>Unread:</span>
                <span className="font-medium">4</span>
              </div>
              <div className="flex justify-between">
                <span>Starred:</span>
                <span className="font-medium">3</span>
              </div>
              <div className="flex justify-between">
                <span>With attachments:</span>
                <span className="font-medium">3</span>
              </div>
              <div className="flex justify-between">
                <span>With events:</span>
                <span className="font-medium">3</span>
              </div>
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold mb-3">Preview Features</h3>
            <ul className="text-sm space-y-1">
              <li>✓ List and reader views</li>
              <li>✓ Folder organization</li>
              <li>✓ Trust indicators</li>
              <li>✓ Proof status badges</li>
              <li>✓ Attachment previews</li>
              <li>✓ Calendar integration</li>
              <li>✓ Responsive design</li>
              <li>✓ Keyboard navigation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
