# ERP Materiales del Norte para Android

Proyecto Android listo para abrir en Android Studio y generar APK/AAB.

## Probar en un teléfono

1. Abra esta carpeta con Android Studio.
2. Espere que termine **Gradle Sync**.
3. Conecte el teléfono con depuración USB y pulse **Run**, o use **Build > Build APK(s)**.

## Crear el archivo para Google Play

1. En Android Studio use **Build > Generate Signed Bundle / APK**.
2. Seleccione **Android App Bundle**.
3. Cree y guarde una llave `.jks`; no la pierda porque se necesita para actualizar la app.
4. Genere la variante `release`. El resultado será `app-release.aab`.
5. Cree su cuenta en Google Play Console, complete la ficha, privacidad, clasificación y pruebas requeridas, y suba el `.aab`.

El identificador actual es `com.ronny.erpmaterialesnorte`, versión `1.0.0` (código 1). Cambie el identificador antes de la primera publicación solamente si desea usar otro definitivo.
