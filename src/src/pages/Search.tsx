import HeaderSearch from "@/components/HeaderSearch"
import SearchComposer from "@/components/SearchComposer";
import TypewriterTitle from "@/components/TitleSearch";


const Pages = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <HeaderSearch />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* Title */}
        <div className="w-full max-w-3xl text-center">
          <TypewriterTitle
            lines={[
              "VEHICLE DETECTION & MONITORING",
              "Tìm kiếm nhanh và dễ dàng sử dụng",
              "Dán link hoặc thêm các video + hình ảnh để xác định phương tiện",
            ]}
            className="text-center"
            lineClassNames={[
              "text-[35px] sm:text-4xl md:text-5xl font-extrabold tracking-tight whitespace-nowrap",
              "mt-3 text-[15px] text-muted-foreground",
              "mt-1 text-[15px] text-muted-foreground",
            ]}
          />
        </div>

        {/* Search Bar */}
        <div className="w-full max-w-3xl mt-8">
          <SearchComposer
            onSend={({ text, files }) => {
              console.log("text:", text);
              console.log("files:", files);
            }}
          />
        </div>
      </main>
    </div>
  );
};

export default Pages;
