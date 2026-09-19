export type RootStackParamList = {
  Login: undefined;
  PackageList: { surveyorName: string };
  CreatePackage: {
    surveyorName: string;
    editPackageId?: string;
    packageName?: string;
    kecamatan?: string;
    desaKelurahan?: string;
  };
  PackageDetail: { packageId: string; packageName: string; surveyorName: string };
  // Layar peta gabungan: menampilkan lokasi survei satu paket (dengan opsi
  // mode anotasi garis/polygon) ATAU seluruh paket sekaligus (tanpa
  // packageId). Menggantikan OfflineMap & PackageMap yang sebelumnya
  // terpisah agar tidak ada dua layar peta yang tumpang tindih.
  Map: { packageId?: string; packageName?: string; surveyorName?: string };
  WorkItemForm: {
    packageId: string;
    packageName: string;
    surveyorName: string;
    infrastructureType: string;
  };
  Queue: undefined;
  AdminDashboard: undefined;
  UserManagement: undefined;
  PackageData: { packageId: string; packageName: string };
  PackageReport: { packageId: string; packageName: string; rows: any[] };
  AllPackagesReport: { allRows: any[] };
  EditItem: { infrastructureType: string; surveyId: string };
  InfraTypeManagement: undefined;
  PublicPackageList: undefined;
  PublicPackageData: { packageId: string; packageName: string };
};




