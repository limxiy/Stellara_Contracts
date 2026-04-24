import Image from "next/image";

export default function HumanMeetsAi() {
    return (
        <article className="flex flex-col  justify-center w-full items-center px-6 ">
            <section className="pl-4 pt-1 bg-[#4D4C4C33] max-w-7xl rounded-4xl relative  sm:flex sm:items-center sm:justify-between w-full sm:gap-5 border-[#4D4C4C] border top-20">
                <h2 className="font-serif text-3xl sm:text-4xl lg:text-[3.25rem] lg:leading-[1.15] font-light leading-tight tracking-tight text-white my-5 absolute -top-25">
                    Where <span className="text-[#E988F2]">human</span>{" "}
                    intuition meets{" "}
                    <span className="text-[#E988F2]">AI intelligence</span>
                </h2>
                <div className="mb-8 sm:mb-0 self-start">
                    <p className="font-light text-[20px] sm:text-[28px] font-serif">
                        <q>The Academy That Trades With You</q>
                    </p>
                    <p className="font-light text-[20px] sm:text-[28px] font-serif">
                        <q>From Zero to On-Chain</q>
                    </p>
                    <p className="font-light text-[20px] sm:text-[28px] font-serif">
                        <q>Learn. Earn. Evolve — on Stellar.</q>
                    </p>
                    <p className="font-light text-[20px] sm:text-[28px] font-serif">
                        <q>Your AI Mentor. Your Blockchain. Your Edge.</q>
                    </p>
                </div>
                <Image
                    src="/images/humanRobotConnect.png"
                    alt="networks"
                    width={546}
                    height={100}
                    className=" object-cover border-2"
                />
                <div className=" w-fit rounded-b-4xl hidden sm:block">
                    <Image
                        src="/images/btc.png"
                        alt="networks"
                        width={70}
                        height={0}
                        className=" absolute bottom-35 sm:left-4 sm:translate-x-67"
                    />
                    <Image
                        src="/images/rectSmall.png"
                        alt="networks"
                        width={400}
                        height={0}
                        className=" absolute bottom-0 sm:left-4 sm:translate-x-25"
                    />
                    <Image
                        src="/images/rectLarge.png"
                        alt="networks"
                        width={500}
                        height={100}
                        className=" absolute bottom-0 sm:left-4 sm:translate-x-12"
                    />
                    <Image
                        src="/images/rectMedium.png"
                        alt="networks"
                        width={600}
                        height={0}
                        className="absolute bottom-0 sm:left-4"
                    />
                </div>
            </section>
        </article>
    );
}
