import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_API_KEY } from "../config";

import { useDeliveryRoute } from "../hooks/useDeliveryRoute";
import { useRoutePlanDirections } from "../utils/useRoutePlanDirections";
import { planRoutes, baselineManual, getLoad } from "../utils/cvrpPlanner";
import { DEPOT } from "../utils/MapDetails";
import { RouteSidebar } from "../Components/delivery-route/RouteSidebar";
import { RouteMap } from "../Components/delivery-route/RouteMap";
import { RouteControls } from "../Components/delivery-route/RouteControls";
import { PlanPanel } from "../Components/delivery-route/PlanPanel";
import { FleetPlanPanel } from "../Components/delivery-route/FleetPlanPanel";
import { PedidosPanel } from "../Components/delivery-route/PedidosPanel";
import { SelectedRouteBar } from "../Components/delivery-route/SelectedRouteBar";
import { CreateRouteModal } from "../Components/delivery-route/CreateRouteModal";
import { PlanSkeletonLoader } from "../Components/delivery-route/RouteSkeletons";
import AlertModal from "../Components/modal/AlertModal";
import { TABS, GOOGLE_MAPS_LIBRARIES } from "../constants/routeConfigs";
import { RouteToast } from "../Components/delivery-route/RouteToast";

export default function DeliveryRouteView() {
  const navigate = useNavigate();
  const rt = useDeliveryRoute();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMunicipios, setShowMunicipios] = useState(true);
  const [plan, setPlan] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [focusedVehicleId, setFocusedVehicleId] = useState(null);
  const [pendingVehicleId, setPendingVehicleId] = useState(null);
  const replanRef = useRef(false);

  const recomputeTotals = (assignments) => ({
    distance: assignments.reduce((s, a) => s + a.distance, 0),
    boxes: assignments.reduce((s, a) => s + a.boxes, 0),
    stops: assignments.reduce((s, a) => s + a.stops.length, 0),
    vehicles: assignments.length,
    avgUtilization: assignments.length
      ? assignments.reduce((s, a) => s + a.utilization, 0) / assignments.length
      : 0,
  });

  const applyRouteToSelection = (a) => {
    rt.setSelectedSaler(a.vehicle.id);
    rt.setSelectedMarkers(a.stops.map((s) => s.raw));
    setPendingVehicleId(a.vehicle.id);
    setFocusedVehicleId(a.vehicle.id);
    rt.setIsOpen(true);
  };

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_API_KEY,
    id: "google-map-script",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const planDirections = useRoutePlanDirections(plan, DEPOT, isLoaded);

  const fleet = useMemo(
    () =>
      rt.vendedores.map((v) => ({
        id: v._id,
        name: `${v.fullName} ${v.lastName ?? ""}`.trim(),
        capacity: 80,
      })),
    [rt.vendedores]
  );

  const planningOrders = useMemo(
    () =>
      (rt.filteredMarkers || []).map((p) => {
        const cl = p.id_client?.client_location || p.client_location || {};
        return {
          _id: p._id,
          lat: Number(cl.latitud),
          lng: Number(cl.longitud),
          boxes: getLoad(p).boxes,
          zone: p.region,
          raw: p,
        };
      }).filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng)),
    [rt.filteredMarkers]
  );

  const baselineKm = useMemo(
    () => (plan ? baselineManual({ orders: planningOrders, depot: DEPOT }).distance : 0),
    [plan, planningOrders]
  );

  const runFleetPlan = (orders) => {
    const result = planRoutes({ orders, depot: DEPOT, vehicles: fleet });
    rt.setDirectionsResponse(null);
    rt.setOptimizationResult(null);
    rt.setSelectedMarkers([]);
    setFocusedVehicleId(null);
    setPlan({ ...result, id: Date.now() });
  };

  const handleFleetPlan = () => {
    setPlanning(true);
    setTimeout(() => {
      runFleetPlan(planningOrders);
      setPlanning(false);
    }, 30);
  };

  const handlePageSizeChange = (n) => {
    if (plan) {
      replanRef.current = true;
      setPlanning(true);
    }
    rt.setPageSize(Number(n));
  };

  useEffect(() => {
    if (!replanRef.current) return;
    if (rt.loading) return;
    replanRef.current = false;
    if (!planningOrders.length) {
      setPlan(null);
      setPlanning(false);
      return;
    }
    runFleetPlan(planningOrders);
    setPlanning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningOrders, rt.loading]);

  const resetAfterCreate = () => {
    rt.setIsOpen(false);
    rt.setRouteName("");
    rt.setStartDate("");
    rt.setEndDate("");
    rt.setDirectionsResponse(null);
    rt.setSelectedMarkers([]);
    rt.setOptimizationResult(null);
    rt.setSelectedTripView(null);
    rt.setActiveTab(TABS.PEDIDOS);
    setPendingVehicleId(null);
    setFocusedVehicleId(null);
    setPlan(null);
    setPlanning(false);
    if (rt.loadMarkersFromAPI) rt.loadMarkersFromAPI();
  };

  const handleCreateFromPlan = async () => {
    await rt.handleCreateRoute();
    resetAfterCreate();
  };

  const handleCreateManual = async () => {
    await rt.handleCreateRoute();
    resetAfterCreate();
  };

  const clearPlan = () => {
    setPlan(null);
    setFocusedVehicleId(null);
  };


  useEffect(() => {
    if (!isLoaded || !window.google || plan) return;
    if (rt.selectedMarkers.length > 1) {
      const pts = rt.selectedMarkers.filter(c => c.client_location);
      if (pts.length < 2) { rt.setDirectionsResponse(null); return; }
      const origin = { lat: Number(pts[0].client_location.latitud), lng: Number(pts[0].client_location.longitud) };
      const dest = { lat: Number(pts[pts.length - 1].client_location.latitud), lng: Number(pts[pts.length - 1].client_location.longitud) };
      const waypoints = pts.slice(1, -1).map(c => ({ location: { lat: Number(c.client_location.latitud), lng: Number(c.client_location.longitud) }, stopover: true }));
      new window.google.maps.DirectionsService().route(
        { origin, destination: dest, waypoints, travelMode: window.google.maps.TravelMode.DRIVING, optimizeWaypoints: false },
        (result, status) => { if (status === "OK") rt.setDirectionsResponse(result); }
      );
    } else { rt.setDirectionsResponse(null); }
  }, [rt.selectedMarkers, isLoaded, plan]);

  const goToClientDetails = (client) => navigate(`/client/${client._id}`, { state: { client } });

  const sidebarContent = rt.isOptimizing || planning ? (
    <PlanSkeletonLoader />
  ) : plan ? (
    <FleetPlanPanel
      plan={plan}
      baselineKm={baselineKm}
      focusedVehicleId={focusedVehicleId}
      onFocusVehicle={setFocusedVehicleId}
      onCreateRoute={applyRouteToSelection}
      onClear={clearPlan}
      onStopClick={(s) => rt.panToLocation(Number(s.lat), Number(s.lng))}
    />
  ) : rt.optimizationResult && rt.activeTab === TABS.PLAN ? (
    <PlanPanel
      optimizationResult={rt.optimizationResult}
      selectedTripView={rt.selectedTripView}
      onViewTrip={rt.handleViewTrip}
      onClearOptimization={() => { rt.setOptimizationResult(null); rt.setSelectedTripView(null); rt.setActiveTab(TABS.PEDIDOS); }}
      onCreate={() => rt.setIsOpen(true)}
    />
  ) : (
    <PedidosPanel
      loading={rt.loading} markers={rt.filteredMarkers} totalOrders={rt.totalOrders}
      isClientSelected={rt.isClientSelected} panToLocation={rt.panToLocation}
      goToClientDetails={goToClientDetails} handleDelete={rt.handleDelete}
      handleMarkerClick={rt.handleMarkerClick} page={rt.page} setPage={rt.setPage}
      totalPages={rt.totalPages} pageSize={rt.pageSize} setPageSize={rt.setPageSize}
      selectedMunicipio={rt.selectedMunicipio}
    />
  );

  return (
    <div className="h-screen w-full flex overflow-hidden bg-gray-50">
      <style>{`
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>

      <RouteSidebar
        collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed}
        vendedores={rt.vendedores} selectedSaler={rt.selectedSaler}
        onSalerChange={e => { rt.setSelectedSaler(e.target.value); rt.setPage(1); rt.setOptimizationResult(null); rt.setCustomCapacity(null); rt.setActiveTab(TABS.PEDIDOS); clearPlan(); }}
        totalOrders={rt.totalOrders} truckCapacity={rt.truckCapacity}
        currentLoad={rt.currentLoad} utilizationPct={rt.utilizationPct} isOverCapacity={rt.isOverCapacity}
        searchTerm={rt.searchTerm} setSearchTerm={rt.setSearchTerm} onSearch={rt.loadMarkersFromAPI}
        selectedMunicipio={rt.selectedMunicipio} setSelectedMunicipio={rt.setSelectedMunicipio}
        fitMunicipio={rt.fitMunicipio} municipioGroups={rt.municipioGroups}
        canOptimize={rt.canOptimize} isOptimizing={rt.isOptimizing} onOptimize={rt.handleOptimize}
        markers={rt.markers} selectedMarkers={rt.selectedMarkers}
        onCreateManual={() => rt.setIsOpen(true)}
        optimizationResult={rt.optimizationResult} activeTab={rt.activeTab} setActiveTab={rt.setActiveTab}
        fleetSize={fleet.length} planningOrdersCount={planningOrders.length}
        onFleetPlan={handleFleetPlan} planning={planning} hasPlan={Boolean(plan)}
        onManualAssign={clearPlan}
        pageSize={rt.pageSize} setPageSize={handlePageSizeChange}
      >
        {sidebarContent}
      </RouteSidebar>

      <div className="flex-1 h-full relative bg-gray-200">
        <RouteMap
          isLoaded={isLoaded}
          center={rt.center}
          mapZoom={rt.mapZoom}
          mapRef={rt.mapRef}
          showMunicipios={showMunicipios}
          selectedMunicipio={rt.selectedMunicipio}
          setSelectedMunicipio={rt.setSelectedMunicipio}
          fitMunicipio={rt.fitMunicipio}
          filteredMarkers={rt.filteredMarkers}
          selectedMarkers={rt.selectedMarkers}
          selectedTripView={rt.selectedTripView}
          iconsReady={rt.iconsReady}
          handleMarkerClick={rt.handleMarkerClick}
          handleDelete={rt.handleDelete}
          directionsResponse={rt.directionsResponse}
          truckCapacity={rt.truckCapacity}
          plan={plan}
          planDirections={planDirections}
          focusedVehicleId={focusedVehicleId}
          onFocusVehicle={setFocusedVehicleId}
          onStopClick={(s) => rt.panToLocation(Number(s.lat), Number(s.lng))}
          hidePlanOverlay
        />
        <RouteToast toast={rt.toast} onClose={rt.dismissToast} />
        <RouteControls
          mapRef={rt.mapRef} showMunicipios={showMunicipios} setShowMunicipios={setShowMunicipios}
          filteredMarkers={rt.filteredMarkers} selectedMarkers={rt.selectedMarkers}
          fitToMarkers={rt.fitToMarkers} optimizationResult={rt.optimizationResult}
          municipioGroups={rt.municipioGroups}
        />

        {!plan && rt.selectedMarkers.length > 0 && (
          <SelectedRouteBar
            selectedMarkers={rt.selectedMarkers} selectedTripView={rt.selectedTripView}
            currentLoad={rt.currentLoad} totalAmount={rt.totalAmount}
            moveClient={rt.moveClient} panToLocation={rt.panToLocation} handleDelete={rt.handleDelete}
          />
        )}
      </div>

      <CreateRouteModal
        isOpen={rt.isOpen} onClose={() => rt.setIsOpen(false)}
        optimizationResult={rt.optimizationResult} selectedMarkers={rt.selectedMarkers}
        totalAmount={rt.totalAmount} currentLoad={rt.currentLoad} truckCapacity={rt.truckCapacity}
        vendedores={rt.vendedores} selectedSaler={rt.selectedSaler}
        routeName={rt.routeName} setRouteName={rt.setRouteName}
        startDate={rt.startDate} setStartDate={rt.setStartDate}
        endDate={rt.endDate} setEndDate={rt.setEndDate}
        creating={rt.creating} validateForm={rt.validateForm}
        handleCreateRoute={plan ? handleCreateFromPlan : handleCreateManual}
      />

      <AlertModal show={rt.alertModal} onClose={() => rt.setAlertModal(false)} message={rt.alertMessage} />
    </div>
  );
}